from sqlalchemy import Column, Integer, String, Date, UniqueConstraint

from database import Base


class AIUsage(Base):
    """Tracks how many Gemini-consuming operations (enrichment, search, chat)
    each user has triggered per UTC day, so a single misbehaving or heavy user
    can't run away with the shared Gemini bill."""

    __tablename__ = "ai_usage"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(String, index=True, nullable=False)

    usage_date = Column(Date, nullable=False, index=True)

    count = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint("user_id", "usage_date", name="uq_ai_usage_user_date"),
    )
