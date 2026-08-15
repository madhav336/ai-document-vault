from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func

from database import Base


class ApiKey(Base):

    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(String, index=True, nullable=False)

    name = Column(String, nullable=False)

    key_hash = Column(String, nullable=False, unique=True, index=True)

    key_prefix = Column(String, nullable=False)  # short, non-secret prefix shown in the UI for identification

    created_at = Column(DateTime, server_default=func.now())

    last_used_at = Column(DateTime, nullable=True)
