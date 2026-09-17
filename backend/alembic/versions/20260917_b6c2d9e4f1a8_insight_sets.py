"""cached life insights per user

Revision ID: b6c2d9e4f1a8
Revises: a5b1c8d2e9f4
Create Date: 2026-09-17 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b6c2d9e4f1a8'
down_revision: Union[str, None] = 'a5b1c8d2e9f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'insight_sets',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column(
            'user_id',
            sa.Integer(),
            sa.ForeignKey('users.id', ondelete='CASCADE'),
            nullable=False,
            unique=True,
            index=True,
        ),
        sa.Column('language', sa.String(length=5), nullable=False),
        sa.Column('model', sa.String(length=50), nullable=False),
        sa.Column('generated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('insights', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('insight_sets')
