"""
retriever.py
------------
Thin wrapper around the Chroma collection for querying relevant chunks
given a student's question.
"""

import os
import sys
from pathlib import Path
os.environ["ANONYMIZED_TELEMETRY"] = "False"
import chromadb
from chromadb.utils import embedding_functions

sys.path.insert(0, str(Path(__file__).parent))

try:
    from ingest import DB_DIR, COLLECTION_NAME, EMBED_MODEL_NAME
except ImportError:
    from .ingest import DB_DIR, COLLECTION_NAME, EMBED_MODEL_NAME


class Retriever:
    def __init__(self):
        client = chromadb.PersistentClient(path=DB_DIR)
        embed_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=EMBED_MODEL_NAME
        )
        try:
            self.collection = client.get_collection(
                name=COLLECTION_NAME, embedding_function=embed_fn
            )
        except Exception:
            self.collection = None

    def is_ready(self) -> bool:
        return self.collection is not None and self.collection.count() > 0

    def retrieve(self, query: str, k: int = 3) -> list[dict]:
        """Returns top-k relevant chunks as a list of
        {text, source, title} dicts."""
        if not self.is_ready():
            return []

        results = self.collection.query(query_texts=[query], n_results=k)
        chunks = []
        for text, meta in zip(results["documents"][0], results["metadatas"][0]):
            chunks.append({
                "text": text,
                "source": meta.get("source", "unknown"),
                "title": meta.get("title", "unknown"),
            })
        return chunks
