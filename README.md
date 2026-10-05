# Socratic RAG Teaching Assistant

A RAG-based AI teaching assistant that doesn't just answer questions —
it **guides students toward the answer themselves**, the way a good human tutor
would. Built with Google Gemini, ChromaDB, FastAPI, and React.

---

## How It Works

1. **Ingestion** — your course material (`.txt` / `.pdf`) is chunked by section
   and embedded into a local ChromaDB vector database using the
   `all-MiniLM-L6-v2` sentence-transformer model (runs locally, no API calls).
2. **Retrieval** — when a student asks a question, the most relevant chunks are
   retrieved from the vector store.
3. **Socratic Engine** — instead of answering directly, Google Gemini is prompted
   (with the retrieved context as ground truth) to ask **ONE guiding question per
   turn**. A hint counter tracks progress, and a **leak-checker** pass catches
   cases where the model tries to give away the answer anyway.
4. **Reveal** — after a configurable number of hints (default 4), the tutor
   explains the answer directly, citing the source material.

---

## Tech Stack

| Layer      | Technology                                       |
|------------|--------------------------------------------------|
| LLM        | Google Gemini (`google-genai` SDK)               |
| Embeddings | Sentence Transformers (`all-MiniLM-L6-v2`, local)|
| Vector DB  | ChromaDB (persistent, local)                     |
| Backend    | FastAPI + Uvicorn                                |
| Frontend   | React 19 + Vite 8                                |

---

## Project Structure

```
socratic-tutor/
├── backend/
│   ├── ingest.py            # Chunking + embedding + indexing
│   ├── retriever.py         # Query wrapper around ChromaDB
│   ├── socratic_tutor.py    # Core Socratic prompting + hint-state engine
│   └── main.py              # FastAPI REST API server
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # React chat UI
│   │   ├── App.css          # Component styles
│   │   ├── index.css        # Global styles
│   │   └── main.jsx         # React entry point
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── data/                    # Drop your course material here (.txt / .pdf)
│   └── sample_notes.txt     # Sample calculus notes included for testing
├── chroma_db/               # Local vector DB (created automatically)
├── requirements.txt         # Python dependencies
├── .env.example             # Environment variable template
└── README.md
```

---

## Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- A [Google Gemini API key](https://aistudio.google.com/apikey)

### 1. Clone the repository

```bash
git clone https://github.com/Amankumar9242/Socratic-RAG.git
cd Socratic-RAG
```

### 2. Install Python dependencies

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and add your Gemini API key:

```
GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. Add course material

A sample file (`data/sample_notes.txt`, an intro-to-derivatives lesson) is
already included so you can test immediately. To use your own material, drop
`.txt` or `.pdf` files into `data/`.

### 5. Build the vector index

```bash
python backend/ingest.py
```

You should see something like `Indexed 6 chunks from 1 document(s).`
Re-run this any time you add or change files in `data/`.

### 6. Start the backend

```bash
uvicorn backend.main:app --reload
```

The API server starts at `http://localhost:8000`.

### 7. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

The React app opens at `http://localhost:5173`.

---

## API Endpoints

| Method | Endpoint        | Description                            |
|--------|-----------------|----------------------------------------|
| `GET`  | `/health`       | Check API status and index readiness   |
| `POST` | `/session/new`  | Create a new tutoring session          |
| `POST` | `/ask`          | Send a student message and get a reply |

### `/ask` request body

```json
{
  "session_id": "uuid-string (optional, auto-created if omitted)",
  "message": "What is the derivative of x^3 + 5x?"
}
```

### `/ask` response

```json
{
  "session_id": "...",
  "reply": "Great question! What rule do you apply when differentiating x^n?",
  "sources": ["sample_notes.txt — The Power Rule"],
  "hint_count": 1,
  "resolved": false,
  "status": "stuck"
}
```

---

## Try It Out

With the included sample notes, try asking:

- _"What's the derivative of x^3 + 5x?"_
- _"How do I differentiate (3x+1)^2?"_
- _"Why can't I just multiply the derivatives in a product?"_

Notice the tutor won't just hand you the formula — it'll ask a question back
first, referencing the actual retrieved material.

---

## Configuration

Edit `.env` to change:

| Variable                 | Default              | Description                                        |
|--------------------------|----------------------|----------------------------------------------------|
| `GEMINI_API_KEY`         | _(required)_         | Your Google Gemini API key                         |
| `GEMINI_MODEL`           | `gemini-2.5-flash`   | Gemini model to use for tutoring                   |
| `MAX_HINTS_BEFORE_REVEAL`| `4`                  | Guiding questions before the tutor reveals the answer |

---

## Extending This Project

Some natural next steps if you want to go further:

- **Multi-subject support** — store a `subject` field in metadata and filter
  retrieval by course.
- **Persistent student profiles** — track which concepts a student struggles
  with across sessions, not just within one.
- **Difficulty levels** — let students choose "gentle hints" vs. "strict
  Socratic mode."
- **Voice mode** — add Whisper for speech-to-text and TTS for spoken tutoring.
- **Eval harness** — log hint counts and resolution rates to measure whether
  the Socratic mode actually improves learning outcomes vs. direct answers.

---

## Notes on Cost & Privacy

- Embeddings run **locally** via `sentence-transformers` — free, no API calls.
- Only the generation step (guiding questions + leak-check) calls the
  Google Gemini API, so each student turn costs roughly **2 small API calls**.
- All course material stays local in ChromaDB on your machine.

---

## License

This project is open source. Feel free to use, modify, and distribute.
