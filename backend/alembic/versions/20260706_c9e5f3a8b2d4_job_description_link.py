"""job application description field, longer link

Revision ID: c9e5f3a8b2d4
Revises: b8d4e2f7a1c3
Create Date: 2026-07-06 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c9e5f3a8b2d4'
down_revision: Union[str, None] = 'b8d4e2f7a1c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('job_applications', sa.Column('description', sa.Text(), nullable=True))
    op.alter_column(
        'job_applications',
        'link',
        existing_type=sa.String(length=500),
        type_=sa.String(length=2000),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        'job_applications',
        'link',
        existing_type=sa.String(length=2000),
        type_=sa.String(length=500),
        existing_nullable=True,
    )
    op.drop_column('job_applications', 'description')
