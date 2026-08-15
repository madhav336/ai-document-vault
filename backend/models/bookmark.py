import enum

from sqlalchemy import Column, Integer, String, DateTime, Boolean, JSON, Text, Enum as SAEnum, Index
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector

from database import Base


class BookmarkStatus(str, enum.Enum):
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class SourceType(str, enum.Enum):
    URL = "url"
    PDF = "pdf"
    TXT = "txt"
    MD = "md"
    DOCX = "docx"


class Bookmark(Base):

    __tablename__ = "bookmarks"

    id = Column(Integer, primary_key=True, index=True)

    title = Column(String)

    url = Column(String, nullable=True)  # nullable: uploaded documents have no URL

    source_type = Column(
        SAEnum(
            SourceType,
            name="source_type",
            native_enum=False,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        default=SourceType.URL,
        server_default=SourceType.URL.value,
        nullable=False,
    )

    # File-backed items (uploads) only; null for URL bookmarks.
    file_name = Column(String, nullable=True)
    file_type = Column(String, nullable=True)          # MIME type
    file_size = Column(Integer, nullable=True)         # bytes
    content_hash = Column(String, nullable=True, index=True)  # sha256, for dedupe
    storage_key = Column(String, nullable=True)        # object-storage pointer
    page_count = Column(Integer, nullable=True)

    error_reason = Column(String, nullable=True)       # user-facing failure explanation

    summary = Column(String, nullable=True)

    category = Column(String, nullable=True)

    user_id = Column(String, index=True, nullable=True) # nullable initially for migration

    status = Column(
        SAEnum(
            BookmarkStatus,
            name="bookmark_status",
            native_enum=False,
            # Without this, SQLAlchemy stores/expects the enum *member name*
            # (PROCESSING) instead of its value (processing), which breaks on
            # every existing row written before this enum existed.
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        default=BookmarkStatus.PROCESSING,
        server_default=BookmarkStatus.COMPLETED.value,
    )

    is_archived = Column(Boolean, default=False, server_default="false")

    embedding = Column(Vector(768), nullable=True)

    tags = Column(JSON, nullable=True)

    key_insight = Column(String, nullable=True)

    created_at = Column(DateTime, server_default=func.now())

    @property
    def has_file(self) -> bool:
        """True when an original file is stored (upload), for the API response."""
        return bool(self.storage_key)

    __table_args__ = (
        Index(
            "bookmarks_embedding_hnsw_idx",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )