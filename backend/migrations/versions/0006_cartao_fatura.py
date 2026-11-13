"""cartao_fatura

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-04

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cartao",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("conta_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("nome", sa.String(length=60), nullable=False),
        sa.Column("limite", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("dia_fechamento", mysql.TINYINT(unsigned=True), nullable=False),
        sa.Column("dia_vencimento", mysql.TINYINT(unsigned=True), nullable=False),
        sa.Column("bandeira", sa.String(length=30), nullable=True),
        sa.Column(
            "criado_em",
            mysql.DATETIME(fsp=6),
            server_default=sa.text("CURRENT_TIMESTAMP(6)"),
            nullable=False,
        ),
        sa.Column(
            "atualizado_em",
            mysql.DATETIME(fsp=6),
            server_default=sa.text(
                "CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"
            ),
            nullable=False,
        ),
        sa.CheckConstraint(
            "limite > 0",
            name=op.f("ck_cartao_limite"),
        ),
        sa.CheckConstraint(
            "dia_fechamento BETWEEN 1 AND 31",
            name=op.f("ck_cartao_dia_fechamento"),
        ),
        sa.CheckConstraint(
            "dia_vencimento BETWEEN 1 AND 31",
            name=op.f("ck_cartao_dia_vencimento"),
        ),
        sa.ForeignKeyConstraint(
            ["conta_id"],
            ["conta.id"],
            name="fk_cartao_conta_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_cartao"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_cartao_conta_id", "cartao", ["conta_id"])

    op.create_table(
        "fatura",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("cartao_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("mes_ref", sa.Date(), nullable=False),
        sa.Column(
            "criado_em",
            mysql.DATETIME(fsp=6),
            server_default=sa.text("CURRENT_TIMESTAMP(6)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["cartao_id"],
            ["cartao.id"],
            name="fk_fatura_cartao_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_fatura"),
        sa.UniqueConstraint(
            "cartao_id",
            "mes_ref",
            name="uq_fatura_cartao_id_mes_ref",
        ),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )


def downgrade() -> None:
    op.drop_table("fatura")
    op.drop_table("cartao")
