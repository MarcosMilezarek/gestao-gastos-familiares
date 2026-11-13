"""lancamento pagamento_fatura

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-04

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Exceção à regra "só drop_table": aqui se altera a tabela lancamento, que já existe.
    op.add_column(
        "lancamento",
        sa.Column("fatura_id", mysql.BIGINT(unsigned=True), nullable=True),
    )
    op.create_unique_constraint(
        "uq_lancamento_fatura_id",
        "lancamento",
        ["fatura_id"],
    )
    op.create_foreign_key(
        "fk_lancamento_fatura_id",
        "lancamento",
        "fatura",
        ["fatura_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.drop_constraint(op.f("ck_lancamento_tipo"), "lancamento", type_="check")
    op.create_check_constraint(
        op.f("ck_lancamento_tipo"),
        "lancamento",
        "tipo IN ('despesa', 'receita', 'transferencia', 'reajuste', "
        "'pagamento_fatura')",
    )
    op.create_check_constraint(
        op.f("ck_lancamento_fatura"),
        "lancamento",
        "(tipo = 'pagamento_fatura') = (fatura_id IS NOT NULL)",
    )


def downgrade() -> None:
    # Exceção à regra "só drop_table": aqui se altera a tabela lancamento, que já existe.
    # Ordem: ck_lancamento_tipo primeiro (falha se houver pagamento_fatura gravado),
    # depois CHECK, FK, UNIQUE e coluna.
    # Um único ALTER: se a CHECK nova falhar nas linhas existentes, o MySQL desfaz tudo.
    op.execute(
        "ALTER TABLE lancamento DROP CHECK ck_lancamento_tipo, "
        "ADD CONSTRAINT ck_lancamento_tipo CHECK "
        "(tipo IN ('despesa', 'receita', 'transferencia', 'reajuste'))"
    )
    op.drop_constraint(op.f("ck_lancamento_fatura"), "lancamento", type_="check")
    op.drop_constraint("fk_lancamento_fatura_id", "lancamento", type_="foreignkey")
    op.drop_constraint("uq_lancamento_fatura_id", "lancamento", type_="unique")
    op.drop_column("lancamento", "fatura_id")
