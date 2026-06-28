"""Firebase Admin SDK initialization.

Reads credentials from environment variables — works both locally (.env)
and on Render (env vars set in dashboard).

Env vars needed:
  FIREBASE_PROJECT_ID
  FIREBASE_PRIVATE_KEY
  FIREBASE_CLIENT_EMAIL
"""

import os
import firebase_admin
from firebase_admin import credentials, firestore, auth as firebase_auth
from dotenv import load_dotenv

load_dotenv()

_app = None
_db = None


def _init():
    global _app, _db
    if _app is not None:
        return

    private_key = os.environ["FIREBASE_PRIVATE_KEY"].replace("\\n", "\n")

    cred = credentials.Certificate({
        "type": "service_account",
        "project_id": os.environ["FIREBASE_PROJECT_ID"],
        "private_key_id": os.getenv("FIREBASE_PRIVATE_KEY_ID", ""),
        "private_key": private_key,
        "client_email": os.environ["FIREBASE_CLIENT_EMAIL"],
        "client_id": os.getenv("FIREBASE_CLIENT_ID", ""),
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    })

    _app = firebase_admin.initialize_app(cred)
    _db = firestore.client()
    print(f"[Firebase] Initialized — project: {os.environ['FIREBASE_PROJECT_ID']}")


def get_db():
    """Return the Firestore client (initializes on first call)."""
    _init()
    return _db


def verify_token(token: str) -> str:
    """
    Verify a Firebase ID token and return the user's uid.
    Raises ValueError if the token is invalid or expired.
    """
    _init()
    try:
        decoded = firebase_auth.verify_id_token(token)
        return decoded["uid"]
    except Exception as e:
        raise ValueError(f"Invalid Firebase token: {e}")
