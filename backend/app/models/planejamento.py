from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.mysql import BIGINT, DATETIME
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Orcamento(Base):
    __tablename__ = "orcamento"
    __table_args__ = (
        CheckConstraint("renda >= 0", name="renda"),
        CheckConstraint("percentual_economia BETWEEN 0 AND 100", name="percentual"),
        UniqueConstraint(
            "casal_id",
            "mes_ref",
            name="uq_orcamento_casal_id_mes_ref",
        ),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    casal_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("casal.id", name="fk_orcamento_casal_id", ondelete="RESTRICT"),
    )
    mes_ref: Mapped[date]
    renda: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    percentual_economia: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    criado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=text("CURRENT_TIMESTAMP(6)")
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6),
        server_default=text("CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"),
        server_onupdate=text("CURRENT_TIMESTAMP(6)"),
    )


class OrcamentoItem(Base):
    __tablename__ = "orcamento_item"
    __table_args__ = (
        CheckConstraint("limite >= 0", name="limite"),
        UniqueConstraint(
            "orcamento_id",
            "categoria_id",
            name="uq_orcamento_item_orcamento_id_categoria_id",
        ),
        Index("ix_orcamento_item_categoria_id", "categoria_id"),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    orcamento_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "orcamento.id",
            name="fk_orcamento_item_orcamento_id",
            ondelete="RESTRICT",
        ),
    )
    categoria_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "categoria.id",
            name="fk_orcamento_item_categoria_id",
            ondelete="RESTRICT",
        ),
    )
    limite: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    criado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=text("CURRENT_TIMESTAMP(6)")
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6),
        server_default=text("CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"),
        server_onupdate=text("CURRENT_TIMESTAMP(6)"),
    )


class Cenario(Base):
    __tablename__ = "cenario"
    __table_args__ = (
        Index("ix_cenario_casal_id", "casal_id"),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    casal_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("casal.id", name="fk_cenario_casal_id", ondelete="RESTRICT"),
    )
    nome: Mapped[str] = mapped_column(String(80))
    criado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=text("CURRENT_TIMESTAMP(6)")
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6),
        server_default=text("CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"),
        server_onupdate=text("CURRENT_TIMESTAMP(6)"),
    )


class CenarioItem(Base):
    __tablename__ = "cenario_item"
    __table_args__ = (
        CheckConstraint("tipo IN ('renda', 'despesa')", name="tipo"),
        CheckConstraint(
            "tipo <> 'renda' OR dono_usuario_id IS NOT NULL",
            name="dono",
        ),
        CheckConstraint("valor > 0", name="valor"),
        Index("ix_cenario_item_cenario_id", "cenario_id"),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    cenario_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "cenario.id",
            name="fk_cenario_item_cenario_id",
            ondelete="RESTRICT",
        ),
    )
    tipo: Mapped[str] = mapped_column(String(10))
    dono_usuario_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "usuario.id",
            name="fk_cenario_item_dono_usuario_id",
            ondelete="RESTRICT",
        ),
    )
    descricao: Mapped[str] = mapped_column(String(120))
    valor: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    criado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=text("CURRENT_TIMESTAMP(6)")
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6),
        server_default=text("CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"),
        server_onupdate=text("CURRENT_TIMESTAMP(6)"),
    )
