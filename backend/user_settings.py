"""User settings stored in Firestore.

Stores API keys + model configuration per user at:
  users/{uid}/settings  (singleton document)
"""

from datetime import datetime
from typing import Dict, Any, Optional
from .firebase_admin_init import get_db


def _settings_ref(uid: str):
    return get_db().collection("users").document(uid).collection("settings").document("config")


def get_user_settings(uid: str) -> Dict[str, Any]:
    """Return the user's saved API keys and model configuration."""
    doc = _settings_ref(uid).get()
    if not doc.exists:
        return {
            "keys": {"groq": "", "gemini": "", "cerebras": "", "openrouter": ""},
            "council_models": [],
            "master_model": None,
        }
    return doc.to_dict()


def save_user_settings(uid: str, settings: Dict[str, Any]) -> None:
    """Persist user API keys and model configuration to Firestore."""
    _settings_ref(uid).set({
        **settings,
        "updated_at": datetime.utcnow().isoformat(),
    })
    print(f"[Settings:{uid[:8]}] Saved API keys + {len(settings.get('council_models', []))} council models.")
