from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.mysql import BIGINT, DATETIME
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Lancamento(Base):
    __tablename__ = "lancamento"
    __table_args__ = (
        CheckConstraint(
            "tipo IN ('despesa', 'receita', 'transferencia', 'reajuste', "
            "'pagamento_fatura', 'aplicacao', 'resgate')",
            name="tipo",
        ),
        CheckConstraint(
            "(tipo = 'reajuste' AND valor <> 0) OR (tipo <> 'reajuste' AND valor > 0)",
            name="valor",
        ),
        CheckConstraint(
            "situacao IN ('prevista', 'confirmada')",
            name="situacao",
        ),
        CheckConstraint(
            "tipo <> 'reajuste' OR situacao = 'confirmada'",
            name="reajuste",
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
        CheckConstraint(
            "(recorrencia_id IS NULL) = (numero_recorrencia IS NULL)",
            name="recorrencia",
        ),
        CheckConstraint(
            "(tipo = 'pagamento_fatura') = (fatura_id IS NOT NULL)",
            name="fatura",
        ),
        CheckConstraint(
            "(tipo IN ('aplicacao', 'resgate')) = (meta_id IS NOT NULL)",
            name="meta",
        ),
        UniqueConstraint(
            "recorrencia_id",
            "numero_recorrencia",
            name="uq_lancamento_recorrencia_id_numero_recorrencia",
        ),
        UniqueConstraint("fatura_id", name="uq_lancamento_fatura_id"),
        Index("ix_lancamento_conta_id_data", "conta_id", "data"),
        Index("ix_lancamento_conta_destino_id_data", "conta_destino_id", "data"),
        Index("ix_lancamento_meta_id_situacao", "meta_id", "situacao"),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    tipo: Mapped[str] = mapped_column(String(20))
    valor: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    data: Mapped[date]
    situacao: Mapped[str] = mapped_column(String(20))
    descricao: Mapped[str | None] = mapped_column(String(120))
    conta_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("conta.id", name="fk_lancamento_conta_id", ondelete="RESTRICT"),
    )
    conta_destino_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "conta.id",
            name="fk_lancamento_conta_destino_id",
            ondelete="RESTRICT",
        ),
    )
    categoria_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "categoria.id",
            name="fk_lancamento_categoria_id",
            ondelete="RESTRICT",
        ),
        index=True,
    )
    dono_usuario_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "usuario.id",
            name="fk_lancamento_dono_usuario_id",
            ondelete="RESTRICT",
        ),
    )
    observacao: Mapped[str | None] = mapped_column(String(500))
    criado_por_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "usuario.id",
            name="fk_lancamento_criado_por_id",
            ondelete="RESTRICT",
        ),
    )
    recorrencia_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "recorrencia.id",
            name="fk_lancamento_recorrencia_id",
            ondelete="RESTRICT",
        ),
    )
    numero_recorrencia: Mapped[int | None] = mapped_column(Integer)
    fatura_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("fatura.id", name="fk_lancamento_fatura_id", ondelete="RESTRICT"),
    )
    meta_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("meta.id", name="fk_lancamento_meta_id", ondelete="RESTRICT"),
    )
    criado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=text("CURRENT_TIMESTAMP(6)")
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6),
        server_default=text("CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"),
        server_onupdate=text("CURRENT_TIMESTAMP(6)"),
    )


class LancamentoTag(Base):
    __tablename__ = "lancamento_tag"
    __table_args__ = (
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    lancamento_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "lancamento.id",
            name="fk_lancamento_tag_lancamento_id",
            ondelete="RESTRICT",
        ),
        primary_key=True,
    )
    tag_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("tag.id", name="fk_lancamento_tag_tag_id", ondelete="RESTRICT"),
        primary_key=True,
        index=True,
    )
