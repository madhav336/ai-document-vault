from sqlalchemy import Column, Integer, String, DateTime, Boolean, JSON
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector

from database import Base

class Bookmark(Base):

    __tablename__ = "bookmarks"

    id = Column(Integer, primary_key=True, index=True)

    title = Column(String)

    url = Column(String)

    summary = Column(String, nullable=True)

    category = Column(String, nullable=True)

    user_id = Column(String, index=True, nullable=True) # nullable initially for migration

    status = Column(String, default="processing", server_default="completed")

    is_archived = Column(Boolean, default=False, server_default="false")

    embedding = Column(Vector(768), nullable=True)

    tags = Column(JSON, nullable=True)

    created_at = Column(DateTime, server_default=func.now())