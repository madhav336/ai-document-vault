"""baseline schema

Revision ID: 77b484605838
Revises:
Create Date: 2026-07-09 17:18:07.680006

Represents the schema as it exists today (previously built up via ad-hoc
ALTER TABLE checks in main.py). Fresh databases run this to get the full
schema; existing databases should be `alembic stamp`-ed to this revision
instead of running it, since the tables already exist there.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


# revision identifiers, used by Alembic.
revision: str = '77b484605838'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "bookmarks",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("title", sa.String()),
        sa.Column("url", sa.String()),
        sa.Column("summary", sa.String(), nullable=True),
        sa.Column("category", sa.String(), nullable=True),
        sa.Column("user_id", sa.String(), nullable=True, index=True),
        sa.Column("status", sa.String(), server_default="completed"),
        sa.Column("is_archived", sa.Boolean(), server_default=sa.false()),
        sa.Column("embedding", Vector(768), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("key_insight", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.execute(
        "CREATE INDEX IF NOT EXISTS bookmarks_embedding_hnsw_idx "
        "ON bookmarks USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.drop_table("bookmarks")
