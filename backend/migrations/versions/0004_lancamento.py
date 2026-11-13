"""lancamento

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-03

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "lancamento",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column("valor", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("situacao", sa.String(length=20), nullable=False),
        sa.Column("descricao", sa.String(length=120), nullable=True),
        sa.Column("conta_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("conta_destino_id", mysql.BIGINT(unsigned=True), nullable=True),
        sa.Column("categoria_id", mysql.BIGINT(unsigned=True), nullable=True),
        sa.Column("dono_usuario_id", mysql.BIGINT(unsigned=True), nullable=True),
        sa.Column("observacao", sa.String(length=500), nullable=True),
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
            "tipo IN ('despesa', 'receita', 'transferencia', 'reajuste')",
            name=op.f("ck_lancamento_tipo"),
        ),
        sa.CheckConstraint(
            "(tipo = 'reajuste' AND valor <> 0) OR (tipo <> 'reajuste' AND valor > 0)",
            name=op.f("ck_lancamento_valor"),
        ),
        sa.CheckConstraint(
            "situacao IN ('prevista', 'confirmada')",
            name=op.f("ck_lancamento_situacao"),
        ),
        sa.CheckConstraint(
            "tipo <> 'reajuste' OR situacao = 'confirmada'",
            name=op.f("ck_lancamento_reajuste"),
        ),
        sa.CheckConstraint(
            "(tipo = 'transferencia') = (conta_destino_id IS NOT NULL) "
            "AND (conta_destino_id IS NULL OR conta_destino_id <> conta_id)",
            name=op.f("ck_lancamento_destino"),
        ),
        sa.CheckConstraint(
            "(tipo IN ('despesa', 'receita')) = (categoria_id IS NOT NULL)",
            name=op.f("ck_lancamento_categoria"),
        ),
        sa.CheckConstraint(
            "tipo IN ('despesa', 'receita') OR dono_usuario_id IS NULL",
            name=op.f("ck_lancamento_dono"),
        ),
        sa.ForeignKeyConstraint(
            ["conta_id"],
            ["conta.id"],
            name="fk_lancamento_conta_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["conta_destino_id"],
            ["conta.id"],
            name="fk_lancamento_conta_destino_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["categoria_id"],
            ["categoria.id"],
            name="fk_lancamento_categoria_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["dono_usuario_id"],
            ["usuario.id"],
            name="fk_lancamento_dono_usuario_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["criado_por_id"],
            ["usuario.id"],
            name="fk_lancamento_criado_por_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_lancamento"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index(
        "ix_lancamento_conta_id_data", "lancamento", ["conta_id", "data"]
    )
    op.create_index(
        "ix_lancamento_conta_destino_id_data",
        "lancamento",
        ["conta_destino_id", "data"],
    )
    op.create_index("ix_lancamento_categoria_id", "lancamento", ["categoria_id"])

    op.create_table(
        "lancamento_tag",
        sa.Column("lancamento_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("tag_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["lancamento_id"],
            ["lancamento.id"],
            name="fk_lancamento_tag_lancamento_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"],
            ["tag.id"],
            name="fk_lancamento_tag_tag_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("lancamento_id", "tag_id", name="pk_lancamento_tag"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_lancamento_tag_tag_id", "lancamento_tag", ["tag_id"])


def downgrade() -> None:
    op.drop_table("lancamento_tag")
    op.drop_table("lancamento")
