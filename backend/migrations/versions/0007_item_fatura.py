"""item_fatura

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-04

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "serie_cartao",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("cartao_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("conta_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column("descricao", sa.String(length=120), nullable=False),
        sa.Column("valor", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("categoria_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("observacao", sa.String(length=500), nullable=True),
        sa.Column("criado_por_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("data_inicial", sa.Date(), nullable=False),
        sa.Column("dia", mysql.TINYINT(unsigned=True), nullable=False),
        sa.Column("mes_fatura_inicial", sa.Date(), nullable=False),
        sa.Column("numero_final", sa.Integer(), nullable=True),
        sa.Column(
            "gerado_ate",
            sa.Integer(),
            server_default=sa.text("0"),
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
            "tipo IN ('parcelada', 'recorrente')",
            name=op.f("ck_serie_cartao_tipo"),
        ),
        sa.CheckConstraint(
            "valor > 0",
            name=op.f("ck_serie_cartao_valor"),
        ),
        sa.CheckConstraint(
            "dia BETWEEN 1 AND 31",
            name=op.f("ck_serie_cartao_dia"),
        ),
        sa.CheckConstraint(
            "tipo = 'recorrente' OR numero_final IS NOT NULL",
            name=op.f("ck_serie_cartao_final"),
        ),
        sa.ForeignKeyConstraint(
            ["cartao_id"],
            ["cartao.id"],
            name="fk_serie_cartao_cartao_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["conta_id"],
            ["conta.id"],
            name="fk_serie_cartao_conta_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["categoria_id"],
            ["categoria.id"],
            name="fk_serie_cartao_categoria_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["criado_por_id"],
            ["usuario.id"],
            name="fk_serie_cartao_criado_por_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_serie_cartao"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_serie_cartao_cartao_id", "serie_cartao", ["cartao_id"])
    op.create_index("ix_serie_cartao_conta_id", "serie_cartao", ["conta_id"])
    op.create_index("ix_serie_cartao_categoria_id", "serie_cartao", ["categoria_id"])

    op.create_table(
        "serie_cartao_tag",
        sa.Column("serie_cartao_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("tag_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["serie_cartao_id"],
            ["serie_cartao.id"],
            name="fk_serie_cartao_tag_serie_cartao_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"],
            ["tag.id"],
            name="fk_serie_cartao_tag_tag_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint(
            "serie_cartao_id", "tag_id", name="pk_serie_cartao_tag"
        ),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_serie_cartao_tag_tag_id", "serie_cartao_tag", ["tag_id"])

    op.create_table(
        "item_fatura",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("fatura_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("conta_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("tipo", sa.String(length=10), nullable=False),
        sa.Column("valor", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("descricao", sa.String(length=120), nullable=False),
        sa.Column("categoria_id", mysql.BIGINT(unsigned=True), nullable=True),
        sa.Column("observacao", sa.String(length=500), nullable=True),
        sa.Column("serie_id", mysql.BIGINT(unsigned=True), nullable=True),
        sa.Column("numero_serie", sa.Integer(), nullable=True),
        sa.Column("item_origem_id", mysql.BIGINT(unsigned=True), nullable=True),
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
            "tipo IN ('compra', 'estorno', 'ajuste')",
            name=op.f("ck_item_fatura_tipo"),
        ),
        sa.CheckConstraint(
            "(tipo = 'ajuste' AND valor <> 0) OR (tipo <> 'ajuste' AND valor > 0)",
            name=op.f("ck_item_fatura_valor"),
        ),
        sa.CheckConstraint(
            "(tipo = 'ajuste') = (categoria_id IS NULL)",
            name=op.f("ck_item_fatura_categoria"),
        ),
        sa.CheckConstraint(
            "(serie_id IS NULL) = (numero_serie IS NULL) "
            "AND (serie_id IS NULL OR tipo = 'compra')",
            name=op.f("ck_item_fatura_serie"),
        ),
        sa.CheckConstraint(
            "item_origem_id IS NULL OR tipo = 'estorno'",
            name=op.f("ck_item_fatura_origem"),
        ),
        sa.ForeignKeyConstraint(
            ["fatura_id"],
            ["fatura.id"],
            name="fk_item_fatura_fatura_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["conta_id"],
            ["conta.id"],
            name="fk_item_fatura_conta_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["categoria_id"],
            ["categoria.id"],
            name="fk_item_fatura_categoria_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["serie_id"],
            ["serie_cartao.id"],
            name="fk_item_fatura_serie_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["item_origem_id"],
            ["item_fatura.id"],
            name="fk_item_fatura_item_origem_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["criado_por_id"],
            ["usuario.id"],
            name="fk_item_fatura_criado_por_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_item_fatura"),
        sa.UniqueConstraint(
            "serie_id",
            "numero_serie",
            name="uq_item_fatura_serie_id_numero_serie",
        ),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_item_fatura_fatura_id", "item_fatura", ["fatura_id"])
    op.create_index("ix_item_fatura_conta_id", "item_fatura", ["conta_id"])
    op.create_index("ix_item_fatura_categoria_id", "item_fatura", ["categoria_id"])
    op.create_index(
        "ix_item_fatura_item_origem_id", "item_fatura", ["item_origem_id"]
    )

    op.create_table(
        "item_fatura_tag",
        sa.Column("item_fatura_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("tag_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["item_fatura_id"],
            ["item_fatura.id"],
            name="fk_item_fatura_tag_item_fatura_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"],
            ["tag.id"],
            name="fk_item_fatura_tag_tag_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint(
            "item_fatura_id", "tag_id", name="pk_item_fatura_tag"
        ),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_item_fatura_tag_tag_id", "item_fatura_tag", ["tag_id"])


def downgrade() -> None:
    op.drop_table("item_fatura_tag")
    op.drop_table("item_fatura")
    op.drop_table("serie_cartao_tag")
    op.drop_table("serie_cartao")
