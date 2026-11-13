"""usuario_sessao

Revision ID: 0001
Revises:
Create Date: 2026-10-31

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "usuario",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("nome", sa.String(length=80), nullable=False),
        sa.Column(
            "email",
            sa.String(length=254, collation="utf8mb4_0900_as_ci"),
            nullable=False,
        ),
        sa.Column("senha_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "tema",
            sa.String(length=10),
            server_default="claro",
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
            server_onupdate=sa.text("CURRENT_TIMESTAMP(6)"),
            nullable=False,
        ),
        sa.CheckConstraint("tema IN ('claro', 'escuro')", name=op.f("ck_usuario_tema")),
        sa.PrimaryKeyConstraint("id", name="pk_usuario"),
        sa.UniqueConstraint("email", name="uq_usuario_email"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )

    op.create_table(
        "sessao",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("usuario_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("token_hash", sa.CHAR(length=64), nullable=False),
        sa.Column("criado_em", mysql.DATETIME(fsp=6), nullable=False),
        sa.Column("expira_em", mysql.DATETIME(fsp=6), nullable=False),
        sa.Column("ultimo_uso_em", mysql.DATETIME(fsp=6), nullable=False),
        sa.ForeignKeyConstraint(
            ["usuario_id"],
            ["usuario.id"],
            name="fk_sessao_usuario_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sessao"),
        sa.UniqueConstraint("token_hash", name="uq_sessao_token_hash"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_sessao_usuario_id", "sessao", ["usuario_id"])


def downgrade() -> None:
    op.drop_table("sessao")
    op.drop_table("usuario")
