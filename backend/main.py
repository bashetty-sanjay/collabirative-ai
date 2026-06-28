"""FastAPI backend for Collaborative AI — with Firebase Auth."""

from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import uuid
import json
import asyncio
import os

from .firebase_admin_init import verify_token
from . import firestore_storage as storage
from . import firestore_memory as mem
from . import user_settings as usettings
from .council import (
    run_full_council,
    generate_conversation_title,
    stage1_collect_responses,
    stage2_collect_rankings,
    stage3_synthesize_final,
    calculate_aggregate_rankings,
)

app = FastAPI(title="Collaborative AI API")

# CORS
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _raw_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Auth dependency ───────────────────────────────────────────────────────────

async def get_uid(authorization: Optional[str] = Header(default=None)) -> str:
    """Extract and verify the Firebase ID token from the Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1]
    try:
        return verify_token(token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


# ── Pydantic models ───────────────────────────────────────────────────────────

class ModelConfig(BaseModel):
    id: str
    provider: str

class SendMessageConfig(BaseModel):
    keys: Dict[str, str]
    council_models: List[ModelConfig]
    master_model: ModelConfig

class SendMessageRequest(BaseModel):
    content: str
    config: SendMessageConfig

class SaveSettingsRequest(BaseModel):
    keys: Dict[str, str]
    council_models: List[Dict[str, str]]
    master_model: Optional[Dict[str, str]] = None


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"status": "ok", "service": "Collaborative AI API"}


# ── User Settings (API keys + model config) ───────────────────────────────────

@app.get("/api/settings")
async def get_settings(uid: str = Depends(get_uid)):
    """Load user's saved API keys and model configuration."""
    return usettings.get_user_settings(uid)


@app.put("/api/settings")
async def save_settings(request: SaveSettingsRequest, uid: str = Depends(get_uid)):
    """Save user's API keys and model configuration to Firestore."""
    usettings.save_user_settings(uid, request.dict())
    return {"status": "saved"}


# ── Memory ────────────────────────────────────────────────────────────────────

@app.get("/api/memory")
async def get_memory(uid: str = Depends(get_uid)):
    """Return current persistent memory facts for this user."""
    return mem.get_memory(uid)


@app.delete("/api/memory")
async def clear_memory(uid: str = Depends(get_uid)):
    """Clear all memory for this user."""
    from .firebase_admin_init import get_db
    get_db().collection("users").document(uid).collection("memory").document("data").delete()
    return {"status": "cleared"}


# ── Conversations ─────────────────────────────────────────────────────────────

@app.get("/api/conversations")
async def list_conversations(uid: str = Depends(get_uid)):
    return storage.list_conversations(uid)


@app.post("/api/conversations")
async def create_conversation(uid: str = Depends(get_uid)):
    conv_id = str(uuid.uuid4())
    return storage.create_conversation(uid, conv_id)


@app.get("/api/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, uid: str = Depends(get_uid)):
    conv = storage.get_conversation(uid, conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, uid: str = Depends(get_uid)):
    success = storage.delete_conversation(uid, conversation_id)
    if not success:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "deleted", "id": conversation_id}


# ── Send Message (streaming) ──────────────────────────────────────────────────

@app.post("/api/conversations/{conversation_id}/message/stream")
async def send_message_stream(
    conversation_id: str,
    request: SendMessageRequest,
    uid: str = Depends(get_uid),
):
    """Send a message and stream the 3-stage council process via SSE."""
    conversation = storage.get_conversation(uid, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    is_first_message = len(conversation["messages"]) == 0

    async def event_generator():
        try:
            conversation_history = conversation["messages"]

            storage.add_user_message(uid, conversation_id, request.content)

            if is_first_message:
                title = generate_conversation_title(request.content)
                storage.update_conversation_title(uid, conversation_id, title)
                yield f"data: {json.dumps({'type': 'title_complete', 'data': {'title': title}})}\n\n"

            # Stage 1
            yield f"data: {json.dumps({'type': 'stage1_start'})}\n\n"
            stage1_results = await stage1_collect_responses(
                request.content, conversation_history, uid=uid, config=request.config
            )
            if not stage1_results:
                yield f"data: {json.dumps({'type': 'error', 'message': 'All models failed to respond, possibly due to rate limits. Please try again with fewer models.'})}\n\n"
                return
            yield f"data: {json.dumps({'type': 'stage1_complete', 'data': stage1_results})}\n\n"

            # Stage 2
            yield f"data: {json.dumps({'type': 'stage2_start'})}\n\n"
            stage2_results, label_to_model = await stage2_collect_rankings(
                request.content, stage1_results, conversation_history, config=request.config
            )
            aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)
            yield f"data: {json.dumps({'type': 'stage2_complete', 'data': stage2_results, 'metadata': {'label_to_model': label_to_model, 'aggregate_rankings': aggregate_rankings}})}\n\n"

            # Stage 3
            yield f"data: {json.dumps({'type': 'stage3_start'})}\n\n"
            stage3_result = await stage3_synthesize_final(
                request.content, stage1_results, stage2_results,
                conversation_history, uid=uid, config=request.config
            )
            yield f"data: {json.dumps({'type': 'stage3_complete', 'data': stage3_result})}\n\n"

            # Save complete assistant message
            storage.add_assistant_message(uid, conversation_id, stage1_results, stage2_results, stage3_result)

            # Fire-and-forget memory extraction
            asyncio.create_task(
                mem.extract_and_update_memory(uid, request.content, stage3_result.get("response", ""), request.config)
            )

            yield f"data: {json.dumps({'type': 'complete'})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# ── Send Message (non-streaming, kept for compatibility) ──────────────────────

@app.post("/api/conversations/{conversation_id}/message")
async def send_message(
    conversation_id: str,
    request: SendMessageRequest,
    uid: str = Depends(get_uid),
):
    conversation = storage.get_conversation(uid, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    is_first_message = len(conversation["messages"]) == 0
    conversation_history = conversation["messages"]

    storage.add_user_message(uid, conversation_id, request.content)

    if is_first_message:
        title = generate_conversation_title(request.content)
        storage.update_conversation_title(uid, conversation_id, title)

    stage1_results, stage2_results, stage3_result, metadata = await run_full_council(
        request.content, conversation_history, uid=uid, config=request.config
    )

    storage.add_assistant_message(uid, conversation_id, stage1_results, stage2_results, stage3_result)

    asyncio.create_task(
        mem.extract_and_update_memory(uid, request.content, stage3_result.get("response", ""), request.config)
    )

    return {"stage1": stage1_results, "stage2": stage2_results, "stage3": stage3_result, "metadata": metadata}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
