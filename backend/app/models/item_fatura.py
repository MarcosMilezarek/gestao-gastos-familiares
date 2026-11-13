from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.mysql import BIGINT, DATETIME, TINYINT
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SerieCartao(Base):
    __tablename__ = "serie_cartao"
    __table_args__ = (
        CheckConstraint("tipo IN ('parcelada', 'recorrente')", name="tipo"),
        CheckConstraint("valor > 0", name="valor"),
        CheckConstraint("dia BETWEEN 1 AND 31", name="dia"),
        CheckConstraint(
            "tipo = 'recorrente' OR numero_final IS NOT NULL",
            name="final",
        ),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    cartao_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("cartao.id", name="fk_serie_cartao_cartao_id", ondelete="RESTRICT"),
        index=True,
    )
    conta_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("conta.id", name="fk_serie_cartao_conta_id", ondelete="RESTRICT"),
        index=True,
    )
    tipo: Mapped[str] = mapped_column(String(20))
    descricao: Mapped[str] = mapped_column(String(120))
    valor: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    categoria_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "categoria.id",
            name="fk_serie_cartao_categoria_id",
            ondelete="RESTRICT",
        ),
        index=True,
    )
    observacao: Mapped[str | None] = mapped_column(String(500))
    criado_por_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "usuario.id",
            name="fk_serie_cartao_criado_por_id",
            ondelete="RESTRICT",
        ),
    )
    data_inicial: Mapped[date]
    dia: Mapped[int] = mapped_column(TINYINT(unsigned=True))
    mes_fatura_inicial: Mapped[date]
    numero_final: Mapped[int | None] = mapped_column(Integer)
    gerado_ate: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    criado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=text("CURRENT_TIMESTAMP(6)")
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6),
        server_default=text("CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"),
        server_onupdate=text("CURRENT_TIMESTAMP(6)"),
    )


class SerieCartaoTag(Base):
    __tablename__ = "serie_cartao_tag"
    __table_args__ = (
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    serie_cartao_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "serie_cartao.id",
            name="fk_serie_cartao_tag_serie_cartao_id",
            ondelete="RESTRICT",
        ),
        primary_key=True,
    )
    tag_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("tag.id", name="fk_serie_cartao_tag_tag_id", ondelete="RESTRICT"),
        primary_key=True,
        index=True,
    )


class ItemFatura(Base):
    __tablename__ = "item_fatura"
    __table_args__ = (
        UniqueConstraint(
            "serie_id",
            "numero_serie",
            name="uq_item_fatura_serie_id_numero_serie",
        ),
        CheckConstraint("tipo IN ('compra', 'estorno', 'ajuste')", name="tipo"),
        CheckConstraint(
            "(tipo = 'ajuste' AND valor <> 0) OR (tipo <> 'ajuste' AND valor > 0)",
            name="valor",
        ),
        CheckConstraint(
            "(tipo = 'ajuste') = (categoria_id IS NULL)",
            name="categoria",
        ),
        CheckConstraint(
            "(serie_id IS NULL) = (numero_serie IS NULL) "
            "AND (serie_id IS NULL OR tipo = 'compra')",
            name="serie",
        ),
        CheckConstraint(
            "item_origem_id IS NULL OR tipo = 'estorno'",
            name="origem",
        ),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    fatura_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("fatura.id", name="fk_item_fatura_fatura_id", ondelete="RESTRICT"),
        index=True,
    )
    conta_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("conta.id", name="fk_item_fatura_conta_id", ondelete="RESTRICT"),
        index=True,
    )
    tipo: Mapped[str] = mapped_column(String(10))
    valor: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    data: Mapped[date]
    descricao: Mapped[str] = mapped_column(String(120))
    categoria_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "categoria.id",
            name="fk_item_fatura_categoria_id",
            ondelete="RESTRICT",
        ),
        index=True,
    )
    observacao: Mapped[str | None] = mapped_column(String(500))
    serie_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "serie_cartao.id",
            name="fk_item_fatura_serie_id",
            ondelete="RESTRICT",
        ),
    )
    numero_serie: Mapped[int | None] = mapped_column(Integer)
    item_origem_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "item_fatura.id",
            name="fk_item_fatura_item_origem_id",
            ondelete="RESTRICT",
        ),
        index=True,
    )
    criado_por_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "usuario.id",
            name="fk_item_fatura_criado_por_id",
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


class ItemFaturaTag(Base):
    __tablename__ = "item_fatura_tag"
    __table_args__ = (
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    item_fatura_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "item_fatura.id",
            name="fk_item_fatura_tag_item_fatura_id",
            ondelete="RESTRICT",
        ),
        primary_key=True,
    )
    tag_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("tag.id", name="fk_item_fatura_tag_tag_id", ondelete="RESTRICT"),
        primary_key=True,
        index=True,
    )
