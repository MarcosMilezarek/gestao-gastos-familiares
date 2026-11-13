"""conta_categoria_tag

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-03

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "conta",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("usuario_id", mysql.BIGINT(unsigned=True), nullable=True),
        sa.Column("casal_id", mysql.BIGINT(unsigned=True), nullable=True),
        sa.Column("nome", sa.String(length=60), nullable=False),
        sa.Column("instituicao", sa.String(length=60), nullable=True),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column("cor", sa.CHAR(length=7), nullable=False),
        sa.Column(
            "saldo_inicial",
            sa.Numeric(precision=12, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "arquivado",
            mysql.TINYINT(1),
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
            "(usuario_id IS NULL) <> (casal_id IS NULL)", name=op.f("ck_conta_dono")
        ),
        sa.CheckConstraint(
            "tipo IN ('conta_corrente', 'dinheiro', 'poupanca', 'investimentos', "
            "'vr_va', 'outros')",
            name=op.f("ck_conta_tipo"),
        ),
        sa.ForeignKeyConstraint(
            ["usuario_id"],
            ["usuario.id"],
            name="fk_conta_usuario_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["casal_id"],
            ["casal.id"],
            name="fk_conta_casal_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_conta"),
        sa.UniqueConstraint("usuario_id", name="uq_conta_usuario_id"),
        sa.UniqueConstraint("casal_id", name="uq_conta_casal_id"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )

    op.create_table(
        "categoria",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("usuario_id", mysql.BIGINT(unsigned=True), nullable=True),
        sa.Column("casal_id", mysql.BIGINT(unsigned=True), nullable=True),
        sa.Column("categoria_pai_id", mysql.BIGINT(unsigned=True), nullable=True),
        sa.Column("tipo", sa.String(length=10), nullable=False),
        sa.Column(
            "nome",
            sa.String(length=60, collation="utf8mb4_0900_as_ci"),
            nullable=False,
        ),
        sa.Column("icone", sa.String(length=40), nullable=False),
        sa.Column("cor", sa.CHAR(length=7), nullable=True),
        sa.Column(
            "fixa",
            mysql.TINYINT(1),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "arquivado",
            mysql.TINYINT(1),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "escopo",
            sa.String(length=24),
            sa.Computed(
                "IF(usuario_id IS NOT NULL, CONCAT('u', usuario_id), CONCAT('c', casal_id))",
                persisted=True,
            ),
            nullable=False,
        ),
        sa.Column(
            "pai_chave",
            mysql.BIGINT(unsigned=True),
            sa.Computed("COALESCE(categoria_pai_id, 0)", persisted=True),
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
            "(usuario_id IS NULL) <> (casal_id IS NULL)", name=op.f("ck_categoria_dono")
        ),
        sa.CheckConstraint("tipo IN ('despesa', 'receita')", name=op.f("ck_categoria_tipo")),
        sa.CheckConstraint(
            "(categoria_pai_id IS NULL) = (cor IS NOT NULL)", name=op.f("ck_categoria_cor")
        ),
        sa.CheckConstraint(
            "fixa = 0 OR categoria_pai_id IS NULL", name=op.f("ck_categoria_fixa")
        ),
        sa.ForeignKeyConstraint(
            ["usuario_id"],
            ["usuario.id"],
            name="fk_categoria_usuario_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["casal_id"],
            ["casal.id"],
            name="fk_categoria_casal_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["categoria_pai_id"],
            ["categoria.id"],
            name="fk_categoria_categoria_pai_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_categoria"),
        sa.UniqueConstraint(
            "escopo",
            "tipo",
            "pai_chave",
            "nome",
            name="uq_categoria_escopo_tipo_pai_chave_nome",
        ),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_categoria_usuario_id", "categoria", ["usuario_id"])
    op.create_index("ix_categoria_casal_id", "categoria", ["casal_id"])
    op.create_index(
        "ix_categoria_categoria_pai_id", "categoria", ["categoria_pai_id"]
    )

    op.create_table(
        "tag",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("usuario_id", mysql.BIGINT(unsigned=True), nullable=True),
        sa.Column("casal_id", mysql.BIGINT(unsigned=True), nullable=True),
        sa.Column(
            "nome",
            sa.String(length=40, collation="utf8mb4_0900_as_ci"),
            nullable=False,
        ),
        sa.Column(
            "escopo",
            sa.String(length=24),
            sa.Computed(
                "IF(usuario_id IS NOT NULL, CONCAT('u', usuario_id), CONCAT('c', casal_id))",
                persisted=True,
            ),
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
            "(usuario_id IS NULL) <> (casal_id IS NULL)", name=op.f("ck_tag_dono")
        ),
        sa.ForeignKeyConstraint(
            ["usuario_id"],
            ["usuario.id"],
            name="fk_tag_usuario_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["casal_id"],
            ["casal.id"],
            name="fk_tag_casal_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_tag"),
        sa.UniqueConstraint("escopo", "nome", name="uq_tag_escopo_nome"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_tag_usuario_id", "tag", ["usuario_id"])
    op.create_index("ix_tag_casal_id", "tag", ["casal_id"])


def downgrade() -> None:
    op.drop_table("tag")
    op.drop_table("categoria")
    op.drop_table("conta")
