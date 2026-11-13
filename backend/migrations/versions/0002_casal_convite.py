"""casal_convite

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-31

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "casal",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("pessoa_a_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("pessoa_b_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("encerrado_em", mysql.DATETIME(fsp=6), nullable=True),
        sa.Column(
            "criado_em",
            mysql.DATETIME(fsp=6),
            server_default=sa.text("CURRENT_TIMESTAMP(6)"),
            nullable=False,
        ),
        sa.CheckConstraint("pessoa_a_id <> pessoa_b_id", name=op.f("ck_casal_pessoas_distintas")),
        sa.ForeignKeyConstraint(
            ["pessoa_a_id"],
            ["usuario.id"],
            name="fk_casal_pessoa_a_id_usuario",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["pessoa_b_id"],
            ["usuario.id"],
            name="fk_casal_pessoa_b_id_usuario",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_casal"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index(
        "ix_casal_pessoa_a_id_encerrado_em",
        "casal",
        ["pessoa_a_id", "encerrado_em"],
    )
    op.create_index(
        "ix_casal_pessoa_b_id_encerrado_em",
        "casal",
        ["pessoa_b_id", "encerrado_em"],
    )

    op.create_table(
        "convite",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("convidante_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("convidado_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column(
            "estado",
            sa.String(length=20),
            server_default="pendente",
            nullable=False,
        ),
        sa.Column(
            "pendente_chave",
            mysql.BIGINT(unsigned=True),
            sa.Computed("IF(estado = 'pendente', convidante_id, NULL)", persisted=True),
            nullable=True,
        ),
        sa.Column(
            "criado_em",
            mysql.DATETIME(fsp=6),
            server_default=sa.text("CURRENT_TIMESTAMP(6)"),
            nullable=False,
        ),
        sa.Column("respondido_em", mysql.DATETIME(fsp=6), nullable=True),
        sa.CheckConstraint(
            "convidante_id <> convidado_id", name=op.f("ck_convite_pessoas_distintas")
        ),
        sa.CheckConstraint(
            "estado IN ('pendente', 'aceito', 'recusado', 'cancelado', 'invalidado')",
            name=op.f("ck_convite_estado"),
        ),
        sa.ForeignKeyConstraint(
            ["convidante_id"],
            ["usuario.id"],
            name="fk_convite_convidante_id_usuario",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["convidado_id"],
            ["usuario.id"],
            name="fk_convite_convidado_id_usuario",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_convite"),
        sa.UniqueConstraint("pendente_chave", name="uq_convite_pendente_chave"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index(
        "ix_convite_convidado_id_estado",
        "convite",
        ["convidado_id", "estado"],
    )


def downgrade() -> None:
    op.drop_table("convite")
    op.drop_table("casal")
