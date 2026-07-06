"""user language preference

Revision ID: e1a7b5c0d4f6
Revises: d0f6a4b9c3e5
Create Date: 2026-07-06 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e1a7b5c0d4f6'
down_revision: Union[str, None] = 'd0f6a4b9c3e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('language', sa.String(length=5), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'language')
