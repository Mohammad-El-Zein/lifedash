"""user profile fields (job title, bio, avatar)

Revision ID: d0f6a4b9c3e5
Revises: c9e5f3a8b2d4
Create Date: 2026-07-06 02:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'd0f6a4b9c3e5'
down_revision: Union[str, None] = 'c9e5f3a8b2d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('job_title', sa.String(length=200), nullable=True))
    op.add_column('users', sa.Column('bio', sa.String(length=1000), nullable=True))
    op.add_column('users', sa.Column('avatar_blob_name', sa.String(length=300), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'avatar_blob_name')
    op.drop_column('users', 'bio')
    op.drop_column('users', 'job_title')
