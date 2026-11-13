from datetime import datetime
from decimal import Decimal

from sqlalchemy import CHAR, CheckConstraint, ForeignKey, Numeric, String, text
from sqlalchemy.dialects.mysql import BIGINT, DATETIME, TINYINT
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Conta(Base):
    __tablename__ = "conta"
    __table_args__ = (
        CheckConstraint("(usuario_id IS NULL) <> (casal_id IS NULL)", name="dono"),
        CheckConstraint(
            "tipo IN ('conta_corrente', 'dinheiro', 'poupanca', 'investimentos', "
            "'vr_va', 'outros')",
            name="tipo",
        ),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    usuario_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("usuario.id", name="fk_conta_usuario_id", ondelete="RESTRICT"),
        unique=True,
    )
    casal_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("casal.id", name="fk_conta_casal_id", ondelete="RESTRICT"),
        unique=True,
    )
    nome: Mapped[str] = mapped_column(String(60))
    instituicao: Mapped[str | None] = mapped_column(String(60))
    tipo: Mapped[str] = mapped_column(String(20))
    cor: Mapped[str] = mapped_column(CHAR(7))
    saldo_inicial: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), server_default=text("0")
    )
    arquivado: Mapped[bool] = mapped_column(TINYINT(1), server_default=text("0"))
    criado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6), server_default=text("CURRENT_TIMESTAMP(6)")
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DATETIME(fsp=6),
        server_default=text("CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)"),
        server_onupdate=text("CURRENT_TIMESTAMP(6)"),
    )
