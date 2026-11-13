from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Computed,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.mysql import BIGINT, DATETIME
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Casal(Base):
    __tablename__ = "casal"
    __table_args__ = (
        CheckConstraint("pessoa_a_id <> pessoa_b_id", name="pessoas_distintas"),
        Index("ix_casal_pessoa_a_id_encerrado_em", "pessoa_a_id", "encerrado_em"),
        Index("ix_casal_pessoa_b_id_encerrado_em", "pessoa_b_id", "encerrado_em"),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    pessoa_a_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("usuario.id", name="fk_casal_pessoa_a_id_usuario", ondelete="RESTRICT"),
    )
    pessoa_b_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("usuario.id", name="fk_casal_pessoa_b_id_usuario", ondelete="RESTRICT"),
    )
    encerrado_em: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6))
    criado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=text("CURRENT_TIMESTAMP(6)")
    )


class Convite(Base):
    __tablename__ = "convite"
    __table_args__ = (
        CheckConstraint("convidante_id <> convidado_id", name="pessoas_distintas"),
        CheckConstraint(
            "estado IN ('pendente', 'aceito', 'recusado', 'cancelado', 'invalidado')",
            name="estado",
        ),
        UniqueConstraint("pendente_chave", name="uq_convite_pendente_chave"),
        Index("ix_convite_convidado_id_estado", "convidado_id", "estado"),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    convidante_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "usuario.id", name="fk_convite_convidante_id_usuario", ondelete="RESTRICT"
        ),
    )
    convidado_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "usuario.id", name="fk_convite_convidado_id_usuario", ondelete="RESTRICT"
        ),
    )
    estado: Mapped[str] = mapped_column(String(20), server_default="pendente")
    # Coluna gerada: convidante_id só enquanto o convite está pendente (RF-1.06).
    pendente_chave: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        Computed("IF(estado = 'pendente', convidante_id, NULL)", persisted=True),
    )
    criado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=text("CURRENT_TIMESTAMP(6)")
    )
    respondido_em: Mapped[datetime | None] = mapped_column(DATETIME(fsp=6))
