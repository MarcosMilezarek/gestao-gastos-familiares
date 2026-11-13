from datetime import datetime

from sqlalchemy import CHAR, CheckConstraint, ForeignKey, String, text
from sqlalchemy.dialects.mysql import BIGINT, DATETIME
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Usuario(Base):
    __tablename__ = "usuario"
    __table_args__ = (
        CheckConstraint("tema IN ('claro', 'escuro')", name="tema"),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    nome: Mapped[str] = mapped_column(String(80))
    email: Mapped[str] = mapped_column(
        String(254, collation="utf8mb4_0900_as_ci"), unique=True
    )
    senha_hash: Mapped[str] = mapped_column(String(255))
    tema: Mapped[str] = mapped_column(String(10), server_default="claro")
    criado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=text("CURRENT_TIMESTAMP(6)")
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6),
        server_default=text("CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"),
        server_onupdate=text("CURRENT_TIMESTAMP(6)"),
    )


class Sessao(Base):
    __tablename__ = "sessao"
    __table_args__ = ({"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},)

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    usuario_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("usuario.id", name="fk_sessao_usuario_id", ondelete="RESTRICT"),
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(CHAR(64), unique=True)
    criado_em: Mapped[datetime] = mapped_column(DATETIME(fsp=6))
    expira_em: Mapped[datetime] = mapped_column(DATETIME(fsp=6))
    ultimo_uso_em: Mapped[datetime] = mapped_column(DATETIME(fsp=6))
