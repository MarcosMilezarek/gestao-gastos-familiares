"""meta meta_rendimento

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-05

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "meta",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("casal_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("nome", sa.String(length=80), nullable=False),
        sa.Column("valor_alvo", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("data_alvo", sa.Date(), nullable=True),
        sa.Column(
            "valor_inicial",
            sa.Numeric(precision=12, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("cor", sa.CHAR(length=7), nullable=False),
        sa.Column("icone", sa.String(length=40), nullable=False),
        sa.Column("descricao", sa.String(length=500), nullable=True),
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
            "valor_alvo > 0",
            name=op.f("ck_meta_valor_alvo"),
        ),
        sa.CheckConstraint(
            "valor_inicial >= 0",
            name=op.f("ck_meta_valor_inicial"),
        ),
        sa.ForeignKeyConstraint(
            ["casal_id"],
            ["casal.id"],
            name="fk_meta_casal_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_meta"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_meta_casal_id", "meta", ["casal_id"])

    op.create_table(
        "meta_rendimento",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("meta_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("valor", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("criado_por_id", mysql.BIGINT(unsigned=True), nullable=False),
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
            "valor <> 0",
            name=op.f("ck_meta_rendimento_valor"),
        ),
        sa.ForeignKeyConstraint(
            ["meta_id"],
            ["meta.id"],
            name="fk_meta_rendimento_meta_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["criado_por_id"],
            ["usuario.id"],
            name="fk_meta_rendimento_criado_por_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_meta_rendimento"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index(
        "ix_meta_rendimento_meta_id_data",
        "meta_rendimento",
        ["meta_id", "data"],
    )


def downgrade() -> None:
    op.drop_table("meta_rendimento")
    op.drop_table("meta")
