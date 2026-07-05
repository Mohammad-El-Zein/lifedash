"""job application documents

Revision ID: b8d4e2f7a1c3
Revises: f3c1a9b0d412
Create Date: 2026-07-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b8d4e2f7a1c3'
down_revision: Union[str, None] = 'f3c1a9b0d412'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'job_documents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('application_id', sa.Integer(), nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('content_type', sa.String(length=100), nullable=False),
        sa.Column('size_bytes', sa.Integer(), nullable=False),
        sa.Column('blob_name', sa.String(length=300), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['application_id'], ['job_applications.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('blob_name'),
    )
    op.create_index(op.f('ix_job_documents_application_id'), 'job_documents', ['application_id'])
    op.create_index(op.f('ix_job_documents_user_id'), 'job_documents', ['user_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_job_documents_user_id'), table_name='job_documents')
    op.drop_index(op.f('ix_job_documents_application_id'), table_name='job_documents')
    op.drop_table('job_documents')
