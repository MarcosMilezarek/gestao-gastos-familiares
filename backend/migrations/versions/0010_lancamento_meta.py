"""lancamento meta

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-05

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Exceção à regra "só drop_table": aqui se altera a tabela lancamento, que já existe.
    op.add_column(
        "lancamento",
        sa.Column("meta_id", mysql.BIGINT(unsigned=True), nullable=True),
    )
    op.create_index(
        "ix_lancamento_meta_id_situacao",
        "lancamento",
        ["meta_id", "situacao"],
    )
    op.create_foreign_key(
        "fk_lancamento_meta_id",
        "lancamento",
        "meta",
        ["meta_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.drop_constraint(op.f("ck_lancamento_tipo"), "lancamento", type_="check")
    op.create_check_constraint(
        op.f("ck_lancamento_tipo"),
        "lancamento",
        "tipo IN ('despesa', 'receita', 'transferencia', 'reajuste', "
        "'pagamento_fatura', 'aplicacao', 'resgate')",
    )
    op.create_check_constraint(
        op.f("ck_lancamento_meta"),
        "lancamento",
        "(tipo IN ('aplicacao', 'resgate')) = (meta_id IS NOT NULL)",
    )


def downgrade() -> None:
    # Exceção à regra "só drop_table": aqui se altera a tabela lancamento, que já existe.
    # Ordem: ck_lancamento_tipo primeiro (falha se houver aplicacao ou resgate gravados),
    # depois CHECK, FK, índice e coluna.
    # Um único ALTER: se a CHECK nova falhar nas linhas existentes, o MySQL desfaz tudo.
    op.execute(
        "ALTER TABLE lancamento DROP CHECK ck_lancamento_tipo, "
        "ADD CONSTRAINT ck_lancamento_tipo CHECK "
        "(tipo IN ('despesa', 'receita', 'transferencia', 'reajuste', 'pagamento_fatura'))"
    )
    op.drop_constraint(op.f("ck_lancamento_meta"), "lancamento", type_="check")
    op.drop_constraint("fk_lancamento_meta_id", "lancamento", type_="foreignkey")
    op.drop_index("ix_lancamento_meta_id_situacao", "lancamento")
    op.drop_column("lancamento", "meta_id")
