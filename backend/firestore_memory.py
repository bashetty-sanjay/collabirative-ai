"""Firestore-based memory — replaces memory.py.

Per-user memory stored at users/{uid}/memory (singleton document).
Structure:
  facts:          list[str]   — long-term extracted facts (max 100)
  recent_queries: list[dict]  — rolling last 15 Q&A pairs
  updated_at:     str
"""

import re
from datetime import datetime
from typing import List, Dict, Any, Optional
from .firebase_admin_init import get_db

MAX_RECENT = 15


def _mem_ref(uid: str):
    return get_db().collection("users").document(uid).collection("memory").document("data")


def get_memory(uid: str) -> Dict[str, Any]:
    """Load memory document for a user."""
    doc = _mem_ref(uid).get()
    if not doc.exists:
        return {"facts": [], "recent_queries": [], "updated_at": ""}
    return doc.to_dict()


def get_memory_prompt(uid: str) -> Optional[str]:
    """
    Build a system-prompt string from the user's memory, or None if empty.
    Includes long-term facts + last 15 recent Q&A summaries.
    """
    mem = get_memory(uid)
    facts = mem.get("facts", [])
    recent = mem.get("recent_queries", [])

    if not facts and not recent:
        return None

    lines = ["[Persistent User Memory]"]

    if facts:
        lines.append("Long-term facts about this user:")
        lines.extend(f"- {f}" for f in facts)

    if recent:
        lines.append("\nRecent conversation context (last sessions):")
        for item in recent[-MAX_RECENT:]:
            u = item.get("user", "")[:120]
            a = item.get("assistant", "")[:200]
            lines.append(f'- User asked: "{u}"')
            lines.append(f'  Council answered: "{a}"')

    return "\n".join(lines)


def _save_memory(uid: str, facts: List[str], recent_queries: List[Dict]) -> None:
    """Persist memory back to Firestore."""
    _mem_ref(uid).set({
        "facts": facts[:100],
        "recent_queries": recent_queries[-MAX_RECENT:],
        "updated_at": datetime.utcnow().isoformat(),
    })


async def extract_and_update_memory(
    uid: str,
    user_message: str,
    assistant_response: str,
    config: Any,
) -> bool:
    """
    Extract new memorable facts from the latest exchange and update memory.
    Also appends to recent_queries (rolling window of MAX_RECENT).
    Returns True if memory was updated.
    """
    from .providers import query_model

    mem = get_memory(uid)
    current_facts: List[str] = mem.get("facts", [])
    recent_queries: List[Dict] = mem.get("recent_queries", [])

    # ── Step 1: Append this exchange to recent_queries ──────────────────────
    recent_queries.append({
        "user": user_message[:300],
        "assistant": assistant_response[:500],
        "ts": datetime.utcnow().isoformat(),
    })
    recent_queries = recent_queries[-MAX_RECENT:]

    # ── Step 2: Extract new long-term facts ─────────────────────────────────
    existing_str = (
        "\n".join(f"- {f}" for f in current_facts) if current_facts else "(none yet)"
    )

    prompt = f"""You are a memory extraction assistant. Extract only new, personally relevant long-term facts about the user from this conversation exchange.

Existing remembered facts:
{existing_str}

Latest exchange:
User: {user_message}
Assistant: {assistant_response[:1200]}

Rules:
- Only extract facts worth remembering long-term: name, job, project, tech stack, location, language preference, personal goals.
- Skip generic questions, temporary requests, and anything already in existing facts.
- One fact per line. Plain sentence. No numbering or bullets.
- If nothing new is worth remembering, reply with exactly: NONE

New facts:"""

    # Pick best available model
    model_cfg = config.master_model.dict()
    api_key = config.keys.get(model_cfg["provider"], "")
    if not api_key:
        for m in config.council_models:
            d = m.dict()
            k = config.keys.get(d["provider"], "")
            if k:
                model_cfg, api_key = d, k
                break

    new_facts: List[str] = []
    if api_key:
        resp = await query_model(
            model=model_cfg["id"],
            provider=model_cfg["provider"],
            api_key=api_key,
            messages=[{"role": "user", "content": prompt}],
            timeout=25.0,
        )
        if resp:
            content = resp.get("content", "").strip()
            if content and content.upper() != "NONE":
                for line in content.splitlines():
                    line = re.sub(r"^[\d]+[.)]\s*", "", line.strip())
                    line = re.sub(r"^[-•*]\s*", "", line)
                    if len(line) > 8:
                        new_facts.append(line)

    # Merge facts (simple dedup)
    all_facts = list(current_facts)
    for fact in new_facts:
        if not any(fact.lower()[:35] in ex.lower() for ex in all_facts):
            all_facts.append(fact)

    _save_memory(uid, all_facts, recent_queries)
    print(f"[Memory:{uid[:8]}] {len(all_facts)} facts, {len(recent_queries)} recent queries stored.")
    return True
