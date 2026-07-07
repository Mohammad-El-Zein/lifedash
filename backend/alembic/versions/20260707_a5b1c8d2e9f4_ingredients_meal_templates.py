"""ingredients + meal templates with computed nutrition

Revision ID: a5b1c8d2e9f4
Revises: f2b8c6d1e5a7
Create Date: 2026-07-07 03:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a5b1c8d2e9f4'
down_revision: Union[str, None] = 'f2b8c6d1e5a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'ingredients',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column(
            'user_id',
            sa.Integer(),
            sa.ForeignKey('users.id', ondelete='CASCADE'),
            nullable=False,
            index=True,
        ),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('calories_per_100g', sa.Numeric(7, 1), nullable=False),
        sa.Column('protein_per_100g', sa.Numeric(6, 1), nullable=False),
        sa.Column('carbs_per_100g', sa.Numeric(6, 1), nullable=False),
        sa.Column('fat_per_100g', sa.Numeric(6, 1), nullable=False),
        sa.Column('piece_grams', sa.Numeric(7, 1), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.UniqueConstraint('user_id', 'name'),
    )
    op.create_table(
        'meal_templates',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column(
            'user_id',
            sa.Integer(),
            sa.ForeignKey('users.id', ondelete='CASCADE'),
            nullable=False,
            index=True,
        ),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.UniqueConstraint('user_id', 'name'),
    )
    op.create_table(
        'meal_template_items',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column(
            'user_id',
            sa.Integer(),
            sa.ForeignKey('users.id', ondelete='CASCADE'),
            nullable=False,
            index=True,
        ),
        sa.Column(
            'template_id',
            sa.Integer(),
            sa.ForeignKey('meal_templates.id', ondelete='CASCADE'),
            nullable=False,
            index=True,
        ),
        sa.Column(
            'ingredient_id',
            sa.Integer(),
            sa.ForeignKey('ingredients.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('unit', sa.String(length=10), nullable=False),
        sa.Column('amount', sa.Numeric(8, 1), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.add_column(
        'meals',
        sa.Column(
            'template_id',
            sa.Integer(),
            sa.ForeignKey('meal_templates.id', ondelete='SET NULL'),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column('meals', 'template_id')
    op.drop_table('meal_template_items')
    op.drop_table('meal_templates')
    op.drop_table('ingredients')
