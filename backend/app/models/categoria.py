from datetime import datetime

from sqlalchemy import (
    CHAR,
    CheckConstraint,
    Computed,
    ForeignKey,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.mysql import BIGINT, DATETIME, TINYINT
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Categoria(Base):
    __tablename__ = "categoria"
    __table_args__ = (
        CheckConstraint("(usuario_id IS NULL) <> (casal_id IS NULL)", name="dono"),
        CheckConstraint("tipo IN ('despesa', 'receita')", name="tipo"),
        # Só a raiz tem cor; a subcategoria herda na leitura.
        CheckConstraint("(categoria_pai_id IS NULL) = (cor IS NOT NULL)", name="cor"),
        CheckConstraint("fixa = 0 OR categoria_pai_id IS NULL", name="fixa"),
        UniqueConstraint(
            "escopo",
            "tipo",
            "pai_chave",
            "nome",
            name="uq_categoria_escopo_tipo_pai_chave_nome",
        ),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    usuario_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "usuario.id", name="fk_categoria_usuario_id", ondelete="RESTRICT"
        ),
        index=True,
    )
    casal_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("casal.id", name="fk_categoria_casal_id", ondelete="RESTRICT"),
        index=True,
    )
    categoria_pai_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "categoria.id",
            name="fk_categoria_categoria_pai_id",
            ondelete="RESTRICT",
        ),
        index=True,
    )
    tipo: Mapped[str] = mapped_column(String(10))
    nome: Mapped[str] = mapped_column(String(60, collation="utf8mb4_0900_as_ci"))
    icone: Mapped[str] = mapped_column(String(40))
    cor: Mapped[str | None] = mapped_column(CHAR(7))
    fixa: Mapped[bool] = mapped_column(TINYINT(1), server_default=text("0"))
    arquivado: Mapped[bool] = mapped_column(TINYINT(1), server_default=text("0"))
    # Chave de escopo (fatia-2.md §2): "u<usuario_id>" ou "c<casal_id>".
    escopo: Mapped[str] = mapped_column(
        String(24),
        Computed(
            "IF(usuario_id IS NOT NULL, CONCAT('u', usuario_id), CONCAT('c', casal_id))",
            persisted=True,
        ),
    )
    # Chave dos irmãos: 0 na raiz, id do pai na subcategoria.
    pai_chave: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        Computed("COALESCE(categoria_pai_id, 0)", persisted=True),
    )
    criado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=text("CURRENT_TIMESTAMP(6)")
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6),
        server_default=text("CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"),
        server_onupdate=text("CURRENT_TIMESTAMP(6)"),
    )


class Tag(Base):
    __tablename__ = "tag"
    __table_args__ = (
        CheckConstraint("(usuario_id IS NULL) <> (casal_id IS NULL)", name="dono"),
        UniqueConstraint("escopo", "nome", name="uq_tag_escopo_nome"),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    usuario_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("usuario.id", name="fk_tag_usuario_id", ondelete="RESTRICT"),
        index=True,
    )
    casal_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("casal.id", name="fk_tag_casal_id", ondelete="RESTRICT"),
        index=True,
    )
    nome: Mapped[str] = mapped_column(String(40, collation="utf8mb4_0900_as_ci"))
    escopo: Mapped[str] = mapped_column(
        String(24),
        Computed(
            "IF(usuario_id IS NOT NULL, CONCAT('u', usuario_id), CONCAT('c', casal_id))",
            persisted=True,
        ),
    )
    criado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=text("CURRENT_TIMESTAMP(6)")
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6),
        server_default=text("CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"),
        server_onupdate=text("CURRENT_TIMESTAMP(6)"),
    )
