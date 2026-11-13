from datetime import date

from sqlalchemy.orm import Session

from app import tempo
from app.acesso import Contexto
from app.errors import (
    FATURA_JA_PAGA,
    FATURA_ZERADA,
    PAGAMENTO_INEXISTENTE,
    PAGAMENTO_JA_CONFIRMADO,
    PAGAMENTO_PREVISTO_EXISTE,
    AppError,
)
from app.models.lancamento import Lancamento
from app.services import faturas


def pagar(
    db: Session, ctx: Contexto, cartao_id: int, mes: date, data: date | None = None
) -> None:
    hoje = tempo.hoje()
    data = tempo.validar_data(data or hoje, hoje)
    cartao = faturas.travar_cartao(db, ctx, cartao_id)
    fatura = faturas.calcular_mes(db, cartao, mes, hoje)
    if fatura.total == 0:
        raise AppError(409, FATURA_ZERADA, "Fatura zerada: não há o que pagar.")
    if fatura.pagamento is not None:
        if fatura.pagamento.situacao == "confirmada":
            raise AppError(409, FATURA_JA_PAGA, "Fatura já paga.")
        raise AppError(409, PAGAMENTO_PREVISTO_EXISTE, "Já existe pagamento previsto.")

    db.add(
        Lancamento(
            tipo="pagamento_fatura",
            valor=fatura.total,
            data=data,
            situacao="confirmada" if data <= hoje else "prevista",
            descricao=f"Fatura {cartao.nome} {mes.strftime('%m/%Y')}",
            conta_id=cartao.conta_id,
            fatura_id=fatura.id,
            criado_por_id=ctx.usuario_id,
        )
    )
    db.commit()


def confirmar(db: Session, ctx: Contexto, cartao_id: int, mes: date) -> None:
    cartao = faturas.travar_cartao(db, ctx, cartao_id)
    fatura = faturas.calcular_mes(db, cartao, mes)
    if fatura.pagamento is None:
        raise AppError(409, PAGAMENTO_INEXISTENTE, "Não há pagamento para esta fatura.")
    if fatura.pagamento.situacao == "confirmada":
        raise AppError(409, PAGAMENTO_JA_CONFIRMADO, "Pagamento já confirmado.")
    if fatura.total == 0:
        raise AppError(409, FATURA_ZERADA, "Fatura zerada: não há o que pagar.")
    lancamento = db.get(Lancamento, fatura.pagamento.lancamento_id)
    lancamento.valor = fatura.total
    lancamento.situacao = "confirmada"
    db.commit()


def desfazer(db: Session, ctx: Contexto, cartao_id: int, mes: date) -> None:
    cartao = faturas.travar_cartao(db, ctx, cartao_id)
    fatura = faturas.calcular_mes(db, cartao, mes)
    if fatura.pagamento is None:
        raise AppError(409, PAGAMENTO_INEXISTENTE, "Não há pagamento para esta fatura.")
    db.delete(db.get(Lancamento, fatura.pagamento.lancamento_id))
    db.commit()
