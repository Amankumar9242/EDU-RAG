"""
socratic_tutor.py
------------------
The core Socratic reasoning engine. Wraps the Claude API with:
  - retrieved context grounding (RAG)
  - per-question hint-count tracking
  - a "leak checker" pass that stops the model from accidentally
    blurting out the direct answer
  - a reveal mechanism after N unsuccessful hints
"""

import os
import sys
import json
from pathlib import Path
from dataclasses import dataclass, field
from google import genai

sys.path.insert(0, str(Path(__file__).parent))

try:
    from retriever import Retriever
except ImportError:
    from .retriever import Retriever

from dotenv import load_dotenv

load_dotenv()

def get_model_name() -> str:
    return os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
MAX_HINTS = int(os.getenv("MAX_HINTS_BEFORE_REVEAL", "4"))

SOCRATIC_SYSTEM_PROMPT = """You are a patient, encouraging Socratic tutor.

You will be given:
1. Context retrieved from the course material (ground truth - never contradict it,
   never invent facts not supported by it).
2. The conversation so far between you and the student.

Your job is NOT to give the direct answer. Instead:
- Ask exactly ONE guiding question that helps the student take the next step
  themselves.
- Base every hint strictly on the retrieved context.
- If the student's latest message is fully correct, say so clearly, briefly
  explain why using the retrieved context, and cite which part of the material
  supports it.
- If the student is partially correct, acknowledge the correct part specifically,
  then ask a follow-up question targeting only the part they're missing.
- If the student seems completely lost, make your next question simpler and more
  concrete (e.g. a smaller example) rather than repeating the same question.
- Never give away the final formula, numeric answer, or conclusion directly -
  guide them to state it themselves.
- Keep responses short: 2-4 sentences plus one question, never a lecture.

Respond ONLY with a JSON object, no markdown fences, no preamble:
{
  "response": "<your reply to the student>",
  "student_status": "correct" | "partial" | "stuck" | "unclear",
  "is_final_answer_revealed": true | false
}
"""

LEAK_CHECK_PROMPT = """You are a strict reviewer. Given the retrieved ground-truth
context and a proposed tutor response, determine if the tutor response directly
states the final answer, formula, or conclusion instead of guiding the student
toward it themselves.

Respond ONLY with JSON: {{"leaks_answer": true | false, "reason": "<short reason>"}}

Context:
{context}

Proposed tutor response:
{response}
"""


@dataclass
class TutorSession:
    """Holds the running state for one student question/topic."""
    history: list[dict] = field(default_factory=list)  # [{role, content}]
    hint_count: int = 0
    resolved: bool = False


class SocraticTutor:
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        self._client = None
        self.retriever = Retriever()

    def get_client(self):
        if self._client is None:
            key = self.api_key
            if not key or key == "your_gemini_api_key_here":
                raise ValueError("GEMINI_API_KEY is missing or set to placeholder. Please set your GEMINI_API_KEY in .env file.")
            self._client = genai.Client(api_key=key)
        return self._client

    def _call_gemini(self, system: str, user_content: str) -> dict:
        client = self.get_client()
        model_name = get_model_name()
        resp = client.models.generate_content(
            model=model_name,
            contents=user_content,
            config={"system_instruction": system, "max_output_tokens": 500},
        )
        raw = (resp.text or "").strip()

        def _extract_text(text: str) -> dict:
            cleaned = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            try:
                parsed = json.loads(cleaned)
                if isinstance(parsed, dict):
                    if "response" in parsed and isinstance(parsed["response"], str):
                        resp_str = parsed["response"].strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                        if resp_str.startswith("{") and "response" in resp_str:
                            nested = _extract_text(resp_str)
                            parsed["response"] = nested.get("response", resp_str)
                    return parsed
            except Exception:
                pass
            return {"response": cleaned, "student_status": "unclear", "is_final_answer_revealed": False}

        return _extract_text(raw)

    def _check_leak(self, context: str, response: str) -> bool:
        try:
            prompt = LEAK_CHECK_PROMPT.format(context=context, response=response)
            result = self._call_gemini(system="You are a strict JSON-only reviewer.", user_content=prompt)
            return bool(result.get("leaks_answer", False))
        except Exception:
            return False

    def ask(self, session: TutorSession, student_message: str) -> dict:
        """
        Processes one turn of the conversation. Returns a dict with:
          - reply: the text to show the student
          - sources: list of source/title strings used for grounding
          - hint_count, resolved: updated session metadata
        """
        retrieved = self.retriever.retrieve(student_message, k=3)
        context_text = "\n\n---\n\n".join(
            f"[{c['source']} - {c['title']}]\n{c['text']}" for c in retrieved
        ) or "(No matching course material found for this question.)"

        session.history.append({"role": "student", "content": student_message})

        history_text = "\n".join(
            f"{turn['role'].upper()}: {turn['content']}" for turn in session.history
        )

        force_reveal = session.hint_count >= MAX_HINTS

        user_content = f"""RETRIEVED CONTEXT:
{context_text}

CONVERSATION SO FAR:
{history_text}

Hints given so far: {session.hint_count} (max before reveal: {MAX_HINTS})
{"The student has struggled long enough - you must now clearly explain the answer, citing the context, rather than asking another question." if force_reveal else ""}
"""

        try:
            result = self._call_gemini(SOCRATIC_SYSTEM_PROMPT, user_content)
        except Exception as e:
            return {
                "reply": f"⚠️ Gemini API Key Configuration Error: {str(e)}",
                "sources": [c["source"] for c in retrieved],
                "hint_count": session.hint_count,
                "resolved": False,
                "status": "error",
            }
        reply = result.get("response", "").strip()
        
        def _clean_reply(r):
            if isinstance(r, str):
                s = r.strip()
                if s.startswith("{") and "response" in s:
                    try:
                        parsed = json.loads(s)
                        if isinstance(parsed, dict) and "response" in parsed:
                            return _clean_reply(parsed["response"])
                    except Exception:
                        pass
            return r

        reply = _clean_reply(reply)
        status = result.get("student_status", "unclear")
        revealed = bool(result.get("is_final_answer_revealed", False)) or force_reveal

        # Leak check: only bother if the model claims it did NOT reveal the answer yet
        if not revealed and retrieved:
            if self._check_leak(context_text, reply):
                # Ask the model to try again, more conservatively
                retry_content = user_content + "\n\nYour previous draft revealed the answer directly. Rewrite it as a guiding question instead, without stating the final result."
                result = self._call_gemini(SOCRATIC_SYSTEM_PROMPT, retry_content)
                reply = result.get("response", "").strip()
                status = result.get("student_status", status)
                revealed = bool(result.get("is_final_answer_revealed", False))

        session.history.append({"role": "tutor", "content": reply})

        if status == "correct" or revealed:
            session.resolved = True
        else:
            session.hint_count += 1

        return {
            "reply": reply,
            "sources": [f"{c['source']} — {c['title']}" for c in retrieved],
            "hint_count": session.hint_count,
            "resolved": session.resolved,
            "status": status,
        }
