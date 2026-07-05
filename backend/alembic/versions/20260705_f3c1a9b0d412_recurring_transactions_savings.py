"""recurring transactions, paid status, finance settings

Revision ID: f3c1a9b0d412
Revises: e75596e8d9e6
Create Date: 2026-07-05 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'f3c1a9b0d412'
down_revision: Union[str, None] = 'e75596e8d9e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'recurring_transactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=True),
        sa.Column('kind', sa.String(length=10), nullable=False),
        sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=False),
        sa.Column('day_of_month', sa.Integer(), nullable=False),
        sa.Column('start_month', sa.Date(), nullable=False),
        sa.Column('end_month', sa.Date(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['category_id'], ['transaction_categories.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_recurring_transactions_user_id'), 'recurring_transactions', ['user_id'], unique=False)

    op.create_table(
        'recurring_transaction_skips',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('recurring_id', sa.Integer(), nullable=False),
        sa.Column('month', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['recurring_id'], ['recurring_transactions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('recurring_id', 'month'),
    )
    op.create_index(op.f('ix_recurring_transaction_skips_recurring_id'), 'recurring_transaction_skips', ['recurring_id'], unique=False)
    op.create_index(op.f('ix_recurring_transaction_skips_user_id'), 'recurring_transaction_skips', ['user_id'], unique=False)

    op.create_table(
        'finance_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('monthly_savings_target', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('savings_start_month', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_finance_settings_user_id'), 'finance_settings', ['user_id'], unique=True)

    op.add_column('transactions', sa.Column('status', sa.String(length=10), server_default='paid', nullable=False))
    op.add_column('transactions', sa.Column('recurring_id', sa.Integer(), nullable=True))
    op.add_column('transactions', sa.Column('recurring_month', sa.Date(), nullable=True))
    op.create_foreign_key(
        'fk_transactions_recurring_id', 'transactions', 'recurring_transactions',
        ['recurring_id'], ['id'], ondelete='SET NULL',
    )
    op.create_unique_constraint(
        'uq_transactions_recurring_id_recurring_month', 'transactions',
        ['recurring_id', 'recurring_month'],
    )


def downgrade() -> None:
    op.drop_constraint('uq_transactions_recurring_id_recurring_month', 'transactions', type_='unique')
    op.drop_constraint('fk_transactions_recurring_id', 'transactions', type_='foreignkey')
    op.drop_column('transactions', 'recurring_month')
    op.drop_column('transactions', 'recurring_id')
    op.drop_column('transactions', 'status')
    op.drop_index(op.f('ix_finance_settings_user_id'), table_name='finance_settings')
    op.drop_table('finance_settings')
    op.drop_index(op.f('ix_recurring_transaction_skips_user_id'), table_name='recurring_transaction_skips')
    op.drop_index(op.f('ix_recurring_transaction_skips_recurring_id'), table_name='recurring_transaction_skips')
    op.drop_table('recurring_transaction_skips')
    op.drop_index(op.f('ix_recurring_transactions_user_id'), table_name='recurring_transactions')
    op.drop_table('recurring_transactions')
