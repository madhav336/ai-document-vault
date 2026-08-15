from sqlalchemy import Column, Integer, String, Text, ForeignKey, Index
from pgvector.sqlalchemy import Vector

from database import Base


class Chunk(Base):
    """A slice of a document's text with its own embedding. Powers deep RAG
    retrieval in /chat: the question is matched against chunks (page-level),
    not just item-level summaries. URLs produce few chunks; PDFs many."""

    __tablename__ = "chunks"

    id = Column(Integer, primary_key=True, index=True)

    # Parent item lives in the bookmarks table; cascade so deleting an item
    # removes its chunks with no orphaned vectors.
    document_id = Column(
        Integer,
        ForeignKey("bookmarks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user_id = Column(String, index=True, nullable=False)

    chunk_index = Column(Integer, nullable=False)

    content = Column(Text, nullable=False)

    page_number = Column(Integer, nullable=True)  # populated for PDFs

    embedding = Column(Vector(768), nullable=True)

    __table_args__ = (
        Index(
            "chunks_embedding_hnsw_idx",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )
