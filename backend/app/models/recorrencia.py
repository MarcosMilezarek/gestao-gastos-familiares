from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Integer,
    Numeric,
    String,
    text,
)
from sqlalchemy.dialects.mysql import BIGINT, DATETIME, TINYINT
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Recorrencia(Base):
    __tablename__ = "recorrencia"
    __table_args__ = (
        CheckConstraint(
            "tipo IN ('despesa', 'receita', 'transferencia')",
            name="tipo",
        ),
        CheckConstraint("valor > 0", name="valor"),
        CheckConstraint("dia BETWEEN 1 AND 31", name="dia"),
        CheckConstraint(
            "numero_final IS NULL OR numero_final >= 0",
            name="final",
        ),
        CheckConstraint(
            "(tipo = 'transferencia') = (conta_destino_id IS NOT NULL) "
            "AND (conta_destino_id IS NULL OR conta_destino_id <> conta_id)",
            name="destino",
        ),
        CheckConstraint(
            "(tipo IN ('despesa', 'receita')) = (categoria_id IS NOT NULL)",
            name="categoria",
        ),
        CheckConstraint(
            "tipo IN ('despesa', 'receita') OR dono_usuario_id IS NULL",
            name="dono",
        ),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    tipo: Mapped[str] = mapped_column(String(20))
    valor: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    descricao: Mapped[str | None] = mapped_column(String(120))
    conta_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "conta.id",
            name="fk_recorrencia_conta_id",
            ondelete="RESTRICT",
        ),
        index=True,
    )
    conta_destino_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "conta.id",
            name="fk_recorrencia_conta_destino_id",
            ondelete="RESTRICT",
        ),
        index=True,
    )
    categoria_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "categoria.id",
            name="fk_recorrencia_categoria_id",
            ondelete="RESTRICT",
        ),
    )
    dono_usuario_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "usuario.id",
            name="fk_recorrencia_dono_usuario_id",
            ondelete="RESTRICT",
        ),
    )
    observacao: Mapped[str | None] = mapped_column(String(500))
    criado_por_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "usuario.id",
            name="fk_recorrencia_criado_por_id",
            ondelete="RESTRICT",
        ),
    )
    mes_inicial: Mapped[date]
    dia: Mapped[int] = mapped_column(TINYINT(unsigned=True))
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


class RecorrenciaTag(Base):
    __tablename__ = "recorrencia_tag"
    __table_args__ = (
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    recorrencia_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "recorrencia.id",
            name="fk_recorrencia_tag_recorrencia_id",
            ondelete="RESTRICT",
        ),
        primary_key=True,
    )
    tag_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("tag.id", name="fk_recorrencia_tag_tag_id", ondelete="RESTRICT"),
        primary_key=True,
        index=True,
    )
