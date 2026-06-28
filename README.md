# 🤝 Collaborative AI — LLM Council

> **A multi-model AI deliberation system** — ask a question, let multiple LLMs debate, rank each other's work, and deliver a unified final answer.

Built entirely by **Mahesh Challa** as a personal project to explore how multiple large language models can collaboratively reason, critique, and synthesize better answers than any single model alone.

---

## 💡 What is This?

Instead of relying on a single AI model, **Collaborative AI** routes your query to a **council of LLMs**. The models independently answer your question, anonymously critique each other's responses, and finally a designated **Chairman LLM** synthesizes everything into one polished final answer.

It's like having a board of AI experts deliberate before giving you a response.

---

## ✨ Features

- **Multi-Provider Support**: Route queries natively to models across **Groq, Google Gemini, Hugging Face, Cerebras, and OpenRouter**.
- **Firebase Authentication**: Secure user login via Google Sign-In.
- **Cloud Storage (Firestore)**: Conversations, user settings, and persistent memory are securely stored in Firebase.
- **Dynamic User Settings**: Configure your API keys and select your own council models directly from the UI.
- **Persistent User Memory**: The system automatically extracts and remembers long-term facts about you across conversations.
- **Anonymized Peer Review**: Models receive each other's responses labeled as "Response A/B/C/..." to prevent identity-based bias in rankings.
- **Graceful Degradation**: If one model fails, the council continues with the remaining successful responses.

---

## 🔄 How It Works — 3-Stage Pipeline

### Stage 1 — Individual Opinions
Each council model independently answers the user's query in parallel. All responses are shown in a tab view for side-by-side inspection.

### Stage 2 — Anonymous Peer Review
Each model receives all other models' responses, **anonymized** to prevent identity bias. Each model ranks the responses by accuracy and insight.

### Stage 3 — Chairman Synthesis
The **Chairman LLM** takes all Stage 1 responses and Stage 2 rankings, then synthesizes a final, consolidated answer presented to the user.

---

## 🧱 Architecture

```
User Query
    ↓
Stage 1: Parallel queries to multiple providers → [individual responses]
    ↓
Stage 2: Anonymize → Parallel ranking queries → [evaluations + parsed rankings]
    ↓
Aggregate Rankings Calculation → [sorted by average position]
    ↓
Stage 3: Chairman synthesizes with full context (including Persistent Memory)
    ↓
Return: { stage1, stage2, stage3, metadata }
    ↓
Frontend: Tab view + ranking UI + validation
```

### Backend (`backend/`)

| File | Purpose |
|------|---------|
| `main.py` | FastAPI app, CORS, REST endpoints, SSE streaming |
| `council.py` | Core 3-stage deliberation logic |
| `providers.py` | Multi-provider HTTP client (Groq, Gemini, HF, Cerebras, OpenRouter) |
| `firestore_storage.py` | Conversation persistence using Firebase Firestore |
| `firestore_memory.py` | Extracts and manages persistent user memory facts |
| `user_settings.py` | Manages per-user API keys and model configurations |
| `firebase_admin_init.py` | Initializes Firebase Admin SDK |

### Frontend (`frontend/src/`)

| File | Purpose |
|------|---------|
| `App.jsx` | Routing and auth state management |
| `firebase.js` | Firebase SDK initialization for the client |
| `components/ChatInterface.jsx` | Main conversation UI and streaming handler |
| `components/SettingsModal.jsx` | UI to configure API keys and council models |
| `components/AuthPage.jsx` | Google Sign-In interface |
| `contexts/` | React Contexts for global state (e.g., Auth) |

---

## 🛠️ Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- A Firebase project (for Auth & Firestore)
- API Keys for your preferred providers (Groq, Gemini, OpenRouter, etc.)

---

### 1. Clone the Repository

```bash
git clone https://github.com/MaheshChalla2701/collaborative-ai.git
cd collaborative-ai
```

### 2. Install Dependencies

**Backend:**
```bash
uv sync
```

**Frontend:**
```bash
cd frontend
npm install
cd ..
```

### 3. Configure Firebase (Frontend & Backend)

**Frontend:**
Create a `frontend/.env.local` file with your Firebase project configuration:
```env
VITE_FIREBASE_API_KEY="..."
VITE_FIREBASE_AUTH_DOMAIN="..."
VITE_FIREBASE_PROJECT_ID="..."
VITE_FIREBASE_STORAGE_BUCKET="..."
VITE_FIREBASE_MESSAGING_SENDER_ID="..."
VITE_FIREBASE_APP_ID="..."
```

**Backend:**
Create a `.env` file in the project root containing your Firebase Admin credentials (Service Account):
```env
FIREBASE_PROJECT_ID="..."
FIREBASE_PRIVATE_KEY="..."
FIREBASE_CLIENT_EMAIL="..."
```

### 4. Configure API Keys & Models (Via UI)

Unlike older versions, you do **not** need to hardcode API keys or model lists in configuration files. 
Once you start the app and log in, click the **Settings** icon to enter your API keys and build your custom council of LLMs!

---

## ▶️ Running the App

**Option 1 — Start script (easiest):**
```bash
./start.sh
```

**Option 2 — Manual:**

Terminal 1 (Backend):
```bash
uv run python -m backend.main
```

Terminal 2 (Frontend):
```bash
cd frontend
npm run dev
```

Then open **http://localhost:5173** in your browser.

> **Ports:** Backend runs on `8001`, Frontend on `5173` (Vite default).

---

## 🧰 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | FastAPI (Python 3.10+), async `httpx`, Pydantic v2 |
| **Frontend** | React + Vite, Firebase Auth |
| **Database** | Firebase Firestore (Conversations, Memory, Settings) |
| **AI Gateway** | Native integration with Groq, Gemini, HF, Cerebras, OpenRouter |
| **Package Mgmt** | `uv` (Python), `npm` (JavaScript) |

---

## 👤 Author

**Mahesh Challa**
- GitHub: [@MaheshChalla2701](https://github.com/MaheshChalla2701)

Built from scratch as a personal exploration into multi-agent AI collaboration and anonymous peer review between language models.

---

## 📄 License

This project is open source. Feel free to fork, explore, or extend it however you like.
