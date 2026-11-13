"""recorrencia

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-04

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "recorrencia",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column("valor", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("descricao", sa.String(length=120), nullable=True),
        sa.Column("conta_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("conta_destino_id", mysql.BIGINT(unsigned=True), nullable=True),
        sa.Column("categoria_id", mysql.BIGINT(unsigned=True), nullable=True),
        sa.Column("dono_usuario_id", mysql.BIGINT(unsigned=True), nullable=True),
        sa.Column("observacao", sa.String(length=500), nullable=True),
        sa.Column("criado_por_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("mes_inicial", sa.Date(), nullable=False),
        sa.Column("dia", mysql.TINYINT(unsigned=True), nullable=False),
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
            "tipo IN ('despesa', 'receita', 'transferencia')",
            name=op.f("ck_recorrencia_tipo"),
        ),
        sa.CheckConstraint(
            "valor > 0",
            name=op.f("ck_recorrencia_valor"),
        ),
        sa.CheckConstraint(
            "dia BETWEEN 1 AND 31",
            name=op.f("ck_recorrencia_dia"),
        ),
        sa.CheckConstraint(
            "numero_final IS NULL OR numero_final >= 0",
            name=op.f("ck_recorrencia_final"),
        ),
        sa.CheckConstraint(
            "(tipo = 'transferencia') = (conta_destino_id IS NOT NULL) "
            "AND (conta_destino_id IS NULL OR conta_destino_id <> conta_id)",
            name=op.f("ck_recorrencia_destino"),
        ),
        sa.CheckConstraint(
            "(tipo IN ('despesa', 'receita')) = (categoria_id IS NOT NULL)",
            name=op.f("ck_recorrencia_categoria"),
        ),
        sa.CheckConstraint(
            "tipo IN ('despesa', 'receita') OR dono_usuario_id IS NULL",
            name=op.f("ck_recorrencia_dono"),
        ),
        sa.ForeignKeyConstraint(
            ["conta_id"],
            ["conta.id"],
            name="fk_recorrencia_conta_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["conta_destino_id"],
            ["conta.id"],
            name="fk_recorrencia_conta_destino_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["categoria_id"],
            ["categoria.id"],
            name="fk_recorrencia_categoria_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["dono_usuario_id"],
            ["usuario.id"],
            name="fk_recorrencia_dono_usuario_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["criado_por_id"],
            ["usuario.id"],
            name="fk_recorrencia_criado_por_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_recorrencia"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_recorrencia_conta_id", "recorrencia", ["conta_id"])
    op.create_index(
        "ix_recorrencia_conta_destino_id", "recorrencia", ["conta_destino_id"]
    )

    op.create_table(
        "recorrencia_tag",
        sa.Column("recorrencia_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("tag_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["recorrencia_id"],
            ["recorrencia.id"],
            name="fk_recorrencia_tag_recorrencia_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"],
            ["tag.id"],
            name="fk_recorrencia_tag_tag_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint(
            "recorrencia_id", "tag_id", name="pk_recorrencia_tag"
        ),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_recorrencia_tag_tag_id", "recorrencia_tag", ["tag_id"])

    op.add_column(
        "lancamento",
        sa.Column("recorrencia_id", mysql.BIGINT(unsigned=True), nullable=True),
    )
    op.add_column(
        "lancamento",
        sa.Column("numero_recorrencia", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_lancamento_recorrencia_id",
        "lancamento",
        "recorrencia",
        ["recorrencia_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_check_constraint(
        op.f("ck_lancamento_recorrencia"),
        "lancamento",
        "(recorrencia_id IS NULL) = (numero_recorrencia IS NULL)",
    )
    op.create_unique_constraint(
        "uq_lancamento_recorrencia_id_numero_recorrencia",
        "lancamento",
        ["recorrencia_id", "numero_recorrencia"],
    )


def downgrade() -> None:
    # Exceção à regra "só drop_table": aqui se altera a tabela lancamento, que já existe.
    # Ordem: CHECK, FK, UNIQUE, colunas, depois as tabelas (filha antes de pai).
    op.drop_constraint(
        op.f("ck_lancamento_recorrencia"), "lancamento", type_="check"
    )
    op.drop_constraint(
        "fk_lancamento_recorrencia_id", "lancamento", type_="foreignkey"
    )
    op.drop_constraint(
        "uq_lancamento_recorrencia_id_numero_recorrencia",
        "lancamento",
        type_="unique",
    )
    op.drop_column("lancamento", "numero_recorrencia")
    op.drop_column("lancamento", "recorrencia_id")
    op.drop_table("recorrencia_tag")
    op.drop_table("recorrencia")
