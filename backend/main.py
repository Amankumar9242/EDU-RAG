import os
import sys
import uuid
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Ensure backend folder is in Python path for flexible invocation
sys.path.insert(0, str(Path(__file__).parent))

try:
    from socratic_tutor import SocraticTutor, TutorSession
    from retriever import Retriever
except ImportError:
    from .socratic_tutor import SocraticTutor, TutorSession
    from .retriever import Retriever

load_dotenv()

app = FastAPI(title="Socratic RAG Tutor API")

# Allow the React dev server to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

tutor = SocraticTutor()
sessions: dict[str, TutorSession] = {}  # in-memory session store


class AskRequest(BaseModel):
    session_id: str | None = None
    message: str


class AskResponse(BaseModel):
    session_id: str
    reply: str
    sources: list[str]
    hint_count: int
    resolved: bool
    status: str


@app.get("/health")
def health():
    ready = Retriever().is_ready()
    return {"status": "ok", "index_ready": ready}


@app.post("/session/new")
def new_session():
    session_id = str(uuid.uuid4())
    sessions[session_id] = TutorSession()
    return {"session_id": session_id}


@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest):
    session_id = req.session_id or str(uuid.uuid4())
    if session_id not in sessions:
        sessions[session_id] = TutorSession()

    session = sessions[session_id]
    result = tutor.ask(session, req.message)

    return AskResponse(
        session_id=session_id,
        reply=result["reply"],
        sources=result["sources"],
        hint_count=result["hint_count"],
        resolved=result["resolved"],
        status=result["status"],
    )