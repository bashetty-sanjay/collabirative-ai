"""Persistent cross-conversation memory: extraction and storage."""

import json
import os
import re
from datetime import datetime
from typing import List, Dict, Any, Optional

MEMORY_FILE = "data/memory.json"


def _ensure():
    os.makedirs(os.path.dirname(MEMORY_FILE), exist_ok=True)
    if not os.path.exists(MEMORY_FILE):
        with open(MEMORY_FILE, "w") as f:
            json.dump({"facts": [], "updated_at": datetime.utcnow().isoformat()}, f)


def get_memory() -> Dict[str, Any]:
    """Load memory from disk."""
    _ensure()
    try:
        with open(MEMORY_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {"facts": [], "updated_at": datetime.utcnow().isoformat()}


def save_memory(facts: List[str]) -> None:
    """Persist memory to disk (max 100 facts)."""
    _ensure()
    with open(MEMORY_FILE, "w") as f:
        json.dump(
            {"facts": facts[:100], "updated_at": datetime.utcnow().isoformat()},
            f,
            indent=2,
        )


def get_memory_prompt() -> Optional[str]:
    """
    Return a formatted system-prompt block with current facts,
    or None if memory is empty.
    """
    facts = get_memory().get("facts", [])
    if not facts:
        return None
    lines = "\n".join(f"- {f}" for f in facts)
    return (
        "[Persistent User Memory]\n"
        "The following facts about the user have been remembered from previous conversations:\n"
        + lines
    )


async def extract_and_update_memory(
    user_message: str,
    assistant_response: str,
    config: Any,
) -> bool:
    """
    Ask a model to extract new memorable facts from the latest exchange
    and merge them into memory.json.
    Returns True if memory was updated.
    """
    from .providers import query_model

    current_facts = get_memory().get("facts", [])
    existing_str = (
        "\n".join(f"- {f}" for f in current_facts) if current_facts else "(none yet)"
    )

    prompt = f"""You are a memory extraction assistant. Extract only new, personally relevant facts about the user from the conversation below.

Existing remembered facts:
{existing_str}

Latest exchange:
User: {user_message}
Assistant: {assistant_response[:1500]}

Rules:
- Only extract facts TRULY worth remembering long-term (name, profession, project, preferences, language, city, goals).
- Skip generic greetings, assistant replies, temporary requests.
- Skip anything already covered by existing facts.
- Format: one fact per line, plain sentence, no numbering or bullets.
- If nothing new is worth remembering, reply with exactly: NONE

New facts to remember:"""

    # Pick the fastest available model
    model_cfg = config.master_model.dict()
    api_key = config.keys.get(model_cfg["provider"], "")

    if not api_key:
        for m in config.council_models:
            d = m.dict()
            k = config.keys.get(d["provider"], "")
            if k:
                model_cfg, api_key = d, k
                break

    if not api_key:
        return False

    resp = await query_model(
        model=model_cfg["id"],
        provider=model_cfg["provider"],
        api_key=api_key,
        messages=[{"role": "user", "content": prompt}],
        timeout=25.0,
    )

    if resp is None:
        return False

    content = resp.get("content", "").strip()
    if not content or content.upper() == "NONE":
        return False

    # Parse facts – remove any accidental numbering/bullets
    new_facts = []
    for line in content.splitlines():
        line = re.sub(r"^[\d]+[.)]\s*", "", line.strip())
        line = re.sub(r"^[-•*]\s*", "", line)
        if len(line) > 8:
            new_facts.append(line)

    if not new_facts:
        return False

    # Merge: skip near-duplicates
    all_facts = list(current_facts)
    for fact in new_facts:
        if not any(fact.lower()[:35] in ex.lower() for ex in all_facts):
            all_facts.append(fact)

    save_memory(all_facts)
    print(f"[Memory] Updated — {len(all_facts)} facts stored, {len(new_facts)} new.")
    return True
