from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CHAR, CheckConstraint, ForeignKey, Index, Numeric, String, text
from sqlalchemy.dialects.mysql import BIGINT, DATETIME
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Meta(Base):
    __tablename__ = "meta"
    __table_args__ = (
        CheckConstraint("valor_alvo > 0", name="valor_alvo"),
        CheckConstraint("valor_inicial >= 0", name="valor_inicial"),
        Index("ix_meta_casal_id", "casal_id"),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    casal_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("casal.id", name="fk_meta_casal_id", ondelete="RESTRICT"),
    )
    nome: Mapped[str] = mapped_column(String(80))
    valor_alvo: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    data_alvo: Mapped[date | None]
    valor_inicial: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), server_default=text("0")
    )
    cor: Mapped[str] = mapped_column(CHAR(7))
    icone: Mapped[str] = mapped_column(String(40))
    descricao: Mapped[str | None] = mapped_column(String(500))
    criado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=text("CURRENT_TIMESTAMP(6)")
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6),
        server_default=text("CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"),
        server_onupdate=text("CURRENT_TIMESTAMP(6)"),
    )


class MetaRendimento(Base):
    __tablename__ = "meta_rendimento"
    __table_args__ = (
        CheckConstraint("valor <> 0", name="valor"),
        Index("ix_meta_rendimento_meta_id_data", "meta_id", "data"),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    meta_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("meta.id", name="fk_meta_rendimento_meta_id", ondelete="RESTRICT"),
    )
    data: Mapped[date]
    valor: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    criado_por_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "usuario.id",
            name="fk_meta_rendimento_criado_por_id",
            ondelete="RESTRICT",
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
