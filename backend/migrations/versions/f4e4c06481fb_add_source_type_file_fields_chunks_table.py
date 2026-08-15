"""add source_type, file fields, chunks table

Revision ID: f4e4c06481fb
Revises: ed8966a22ddf
Create Date: 2026-08-15 19:09:02.557718

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import pgvector.sqlalchemy


# revision identifiers, used by Alembic.
revision: str = 'f4e4c06481fb'
down_revision: Union[str, Sequence[str], None] = 'ed8966a22ddf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'chunks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('document_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('chunk_index', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('page_number', sa.Integer(), nullable=True),
        sa.Column('embedding', pgvector.sqlalchemy.vector.VECTOR(dim=768), nullable=True),
        sa.ForeignKeyConstraint(['document_id'], ['bookmarks.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('chunks_embedding_hnsw_idx', 'chunks', ['embedding'], unique=False, postgresql_using='hnsw', postgresql_ops={'embedding': 'vector_cosine_ops'})
    op.create_index(op.f('ix_chunks_document_id'), 'chunks', ['document_id'], unique=False)
    op.create_index(op.f('ix_chunks_id'), 'chunks', ['id'], unique=False)
    op.create_index(op.f('ix_chunks_user_id'), 'chunks', ['user_id'], unique=False)

    op.add_column('bookmarks', sa.Column('source_type', sa.Enum('url', 'pdf', 'txt', 'md', 'docx', name='source_type', native_enum=False), server_default='url', nullable=False))
    op.add_column('bookmarks', sa.Column('file_name', sa.String(), nullable=True))
    op.add_column('bookmarks', sa.Column('file_type', sa.String(), nullable=True))
    op.add_column('bookmarks', sa.Column('file_size', sa.Integer(), nullable=True))
    op.add_column('bookmarks', sa.Column('content_hash', sa.String(), nullable=True))
    op.add_column('bookmarks', sa.Column('storage_key', sa.String(), nullable=True))
    op.add_column('bookmarks', sa.Column('page_count', sa.Integer(), nullable=True))
    op.add_column('bookmarks', sa.Column('error_reason', sa.String(), nullable=True))
    op.create_index(op.f('ix_bookmarks_content_hash'), 'bookmarks', ['content_hash'], unique=False)

    # Backfill: give every existing bookmark a single chunk that reuses its
    # already-stored summary text and row embedding, so /chat can query the
    # chunks table uniformly without re-embedding anything (zero Gemini calls).
    op.execute(
        """
        INSERT INTO chunks (document_id, user_id, chunk_index, content, page_number, embedding)
        SELECT id, user_id, 0, COALESCE(summary, title, ''), NULL, embedding
        FROM bookmarks
        WHERE embedding IS NOT NULL AND user_id IS NOT NULL
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_bookmarks_content_hash'), table_name='bookmarks')
    op.drop_column('bookmarks', 'error_reason')
    op.drop_column('bookmarks', 'page_count')
    op.drop_column('bookmarks', 'storage_key')
    op.drop_column('bookmarks', 'content_hash')
    op.drop_column('bookmarks', 'file_size')
    op.drop_column('bookmarks', 'file_type')
    op.drop_column('bookmarks', 'file_name')
    op.drop_column('bookmarks', 'source_type')
    op.drop_index(op.f('ix_chunks_user_id'), table_name='chunks')
    op.drop_index(op.f('ix_chunks_id'), table_name='chunks')
    op.drop_index(op.f('ix_chunks_document_id'), table_name='chunks')
    op.drop_index('chunks_embedding_hnsw_idx', table_name='chunks', postgresql_using='hnsw', postgresql_ops={'embedding': 'vector_cosine_ops'})
    op.drop_table('chunks')
