"""user theme preference

Revision ID: f2b8c6d1e5a7
Revises: e1a7b5c0d4f6
Create Date: 2026-07-06 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'f2b8c6d1e5a7'
down_revision: Union[str, None] = 'e1a7b5c0d4f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('theme', sa.String(length=10), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'theme')
