from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.mysql import BIGINT, DATETIME, TINYINT
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Cartao(Base):
    __tablename__ = "cartao"
    __table_args__ = (
        CheckConstraint("limite > 0", name="limite"),
        CheckConstraint("dia_fechamento BETWEEN 1 AND 31", name="dia_fechamento"),
        CheckConstraint("dia_vencimento BETWEEN 1 AND 31", name="dia_vencimento"),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    conta_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("conta.id", name="fk_cartao_conta_id", ondelete="RESTRICT"),
        index=True,
    )
    nome: Mapped[str] = mapped_column(String(60))
    limite: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    dia_fechamento: Mapped[int] = mapped_column(TINYINT(unsigned=True))
    dia_vencimento: Mapped[int] = mapped_column(TINYINT(unsigned=True))
    bandeira: Mapped[str | None] = mapped_column(String(30))
    criado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=text("CURRENT_TIMESTAMP(6)")
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6),
        server_default=text("CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"),
        server_onupdate=text("CURRENT_TIMESTAMP(6)"),
    )


class Fatura(Base):
    __tablename__ = "fatura"
    __table_args__ = (
        UniqueConstraint("cartao_id", "mes_ref", name="uq_fatura_cartao_id_mes_ref"),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    cartao_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("cartao.id", name="fk_fatura_cartao_id", ondelete="RESTRICT"),
    )
    mes_ref: Mapped[date]
    criado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=text("CURRENT_TIMESTAMP(6)")
    )
