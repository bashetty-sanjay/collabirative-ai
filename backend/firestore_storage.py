"""Firestore-based conversation storage — replaces storage.py.

All data scoped per user (uid). Structure:
  users/{uid}/conversations/{conv_id}          ← conversation metadata
  users/{uid}/conversations/{conv_id}/messages ← subcollection of messages
"""

from datetime import datetime
from typing import List, Dict, Any, Optional
from .firebase_admin_init import get_db


def _user_ref(uid: str):
    return get_db().collection("users").document(uid)


def _conv_ref(uid: str, conv_id: str):
    return _user_ref(uid).collection("conversations").document(conv_id)


def _msgs_ref(uid: str, conv_id: str):
    return _conv_ref(uid, conv_id).collection("messages")


# ── Conversations ────────────────────────────────────────────────────────────


def list_conversations(uid: str) -> List[Dict[str, Any]]:
    """Return all conversations for a user, sorted newest first."""
    docs = (
        _user_ref(uid)
        .collection("conversations")
        .order_by("updated_at", direction="DESCENDING")
        .stream()
    )
    result = []
    for doc in docs:
        d = doc.to_dict()
        result.append({
            "id": doc.id,
            "title": d.get("title", "Untitled Chat"),
            "created_at": d.get("created_at", ""),
            "updated_at": d.get("updated_at", ""),
            "message_count": d.get("message_count", 0),
        })
    return result


def create_conversation(uid: str, conv_id: str) -> Dict[str, Any]:
    """Create a new empty conversation doc."""
    now = datetime.utcnow().isoformat()
    data = {
        "id": conv_id,
        "title": "New Chat",
        "created_at": now,
        "updated_at": now,
        "message_count": 0,
    }
    _conv_ref(uid, conv_id).set(data)
    return {**data, "messages": []}


def get_conversation(uid: str, conv_id: str) -> Optional[Dict[str, Any]]:
    """Return a conversation with all its messages, or None if not found."""
    doc = _conv_ref(uid, conv_id).get()
    if not doc.exists:
        return None

    data = doc.to_dict()

    # Fetch messages subcollection ordered by timestamp
    msg_docs = _msgs_ref(uid, conv_id).order_by("timestamp").stream()
    messages = [m.to_dict() for m in msg_docs]

    return {
        "id": doc.id,
        "title": data.get("title", "Untitled Chat"),
        "created_at": data.get("created_at", ""),
        "updated_at": data.get("updated_at", ""),
        "message_count": data.get("message_count", 0),
        "messages": messages,
    }


def update_conversation_title(uid: str, conv_id: str, title: str):
    """Update the conversation title."""
    _conv_ref(uid, conv_id).update({
        "title": title,
        "updated_at": datetime.utcnow().isoformat(),
    })


def add_user_message(uid: str, conv_id: str, content: str) -> str:
    """Add a user message to the conversation. Returns the message ID."""
    now = datetime.utcnow().isoformat()
    msg_data = {
        "role": "user",
        "content": content,
        "timestamp": now,
    }
    _, ref = _msgs_ref(uid, conv_id).add(msg_data)
    _conv_ref(uid, conv_id).update({
        "updated_at": now,
        "message_count": _get_message_count(uid, conv_id),
    })
    return ref.id


def add_assistant_message(
    uid: str,
    conv_id: str,
    stage1: List[Dict],
    stage2: List[Dict],
    stage3: Dict,
) -> str:
    """Add a full council assistant message. Returns the message ID."""
    now = datetime.utcnow().isoformat()
    msg_data = {
        "role": "assistant",
        "content": stage3.get("response", ""),
        "stage1": stage1,
        "stage2": stage2,
        "stage3": stage3,
        "timestamp": now,
    }
    _, ref = _msgs_ref(uid, conv_id).add(msg_data)
    _conv_ref(uid, conv_id).update({
        "updated_at": now,
        "message_count": _get_message_count(uid, conv_id),
    })
    return ref.id


def delete_conversation(uid: str, conv_id: str) -> bool:
    """Delete a conversation and all its messages."""
    conv_ref = _conv_ref(uid, conv_id)
    if not conv_ref.get().exists:
        return False

    # Delete all messages first (Firestore subcollections aren't auto-deleted)
    batch = get_db().batch()
    for msg_doc in _msgs_ref(uid, conv_id).stream():
        batch.delete(msg_doc.reference)
    batch.delete(conv_ref)
    batch.commit()
    return True


def _get_message_count(uid: str, conv_id: str) -> int:
    return sum(1 for _ in _msgs_ref(uid, conv_id).stream())
