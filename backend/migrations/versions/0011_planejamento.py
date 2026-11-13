"""planejamento orcamento cenario

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-05

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "orcamento",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("casal_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("mes_ref", sa.Date(), nullable=False),
        sa.Column("renda", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column(
            "percentual_economia",
            sa.Numeric(precision=5, scale=2),
            nullable=False,
        ),
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
            "renda >= 0",
            name=op.f("ck_orcamento_renda"),
        ),
        sa.CheckConstraint(
            "percentual_economia BETWEEN 0 AND 100",
            name=op.f("ck_orcamento_percentual"),
        ),
        sa.ForeignKeyConstraint(
            ["casal_id"],
            ["casal.id"],
            name="fk_orcamento_casal_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_orcamento"),
        sa.UniqueConstraint(
            "casal_id",
            "mes_ref",
            name=op.f("uq_orcamento_casal_id_mes_ref"),
        ),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )

    op.create_table(
        "orcamento_item",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("orcamento_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("categoria_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("limite", sa.Numeric(precision=12, scale=2), nullable=False),
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
            "limite >= 0",
            name=op.f("ck_orcamento_item_limite"),
        ),
        sa.ForeignKeyConstraint(
            ["orcamento_id"],
            ["orcamento.id"],
            name="fk_orcamento_item_orcamento_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["categoria_id"],
            ["categoria.id"],
            name="fk_orcamento_item_categoria_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_orcamento_item"),
        sa.UniqueConstraint(
            "orcamento_id",
            "categoria_id",
            name=op.f("uq_orcamento_item_orcamento_id_categoria_id"),
        ),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index(
        "ix_orcamento_item_categoria_id",
        "orcamento_item",
        ["categoria_id"],
    )

    op.create_table(
        "cenario",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("casal_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("nome", sa.String(length=80), nullable=False),
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
        sa.ForeignKeyConstraint(
            ["casal_id"],
            ["casal.id"],
            name="fk_cenario_casal_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_cenario"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_cenario_casal_id", "cenario", ["casal_id"])

    op.create_table(
        "cenario_item",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("cenario_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("tipo", sa.String(length=10), nullable=False),
        sa.Column("dono_usuario_id", mysql.BIGINT(unsigned=True), nullable=True),
        sa.Column("descricao", sa.String(length=120), nullable=False),
        sa.Column("valor", sa.Numeric(precision=12, scale=2), nullable=False),
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
            "tipo IN ('renda', 'despesa')",
            name=op.f("ck_cenario_item_tipo"),
        ),
        sa.CheckConstraint(
            "tipo <> 'renda' OR dono_usuario_id IS NOT NULL",
            name=op.f("ck_cenario_item_dono"),
        ),
        sa.CheckConstraint(
            "valor > 0",
            name=op.f("ck_cenario_item_valor"),
        ),
        sa.ForeignKeyConstraint(
            ["cenario_id"],
            ["cenario.id"],
            name="fk_cenario_item_cenario_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["dono_usuario_id"],
            ["usuario.id"],
            name="fk_cenario_item_dono_usuario_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_cenario_item"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_cenario_item_cenario_id", "cenario_item", ["cenario_id"])


def downgrade() -> None:
    op.drop_table("cenario_item")
    op.drop_table("cenario")
    op.drop_table("orcamento_item")
    op.drop_table("orcamento")
