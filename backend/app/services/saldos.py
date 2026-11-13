from datetime import date
from decimal import Decimal

from sqlalchemy import and_, case, func, or_, select, union_all
from sqlalchemy.orm import Session

from app.models.conta import Conta
from app.models.lancamento import Lancamento
from app.money import quantizar
from app.services import ganchos


def _movimentos(conta_ids: list[int], filtro):
    origem = select(
        Lancamento.conta_id.label("conta_id"),
        Lancamento.data.label("data"),
        case(
            (Lancamento.tipo.in_(("receita", "reajuste", "resgate")), Lancamento.valor),
            else_=-Lancamento.valor,
        ).label("efeito"),
    ).where(Lancamento.conta_id.in_(conta_ids), filtro)
    destino = select(
        Lancamento.conta_destino_id.label("conta_id"),
        Lancamento.data.label("data"),
        Lancamento.valor.label("efeito"),
    ).where(Lancamento.conta_destino_id.in_(conta_ids), filtro)
    return union_all(origem, destino).subquery("movimentos")


def efeitos_por_data(
    db: Session, conta_ids: list[int], de: date | None, ate: date
) -> list[tuple[date, Decimal]]:
    if not conta_ids:
        return []
    filtro = Lancamento.data <= ate
    if de is not None:
        filtro = and_(filtro, Lancamento.data >= de)
    movimentos = _movimentos(conta_ids, filtro)
    consulta = (
        select(movimentos.c.data, func.sum(movimentos.c.efeito))
        .group_by(movimentos.c.data)
        .order_by(movimentos.c.data)
    )
    return [(data, quantizar(Decimal(total))) for data, total in db.execute(consulta)]


def _saldos(db: Session, conta_ids: list[int], filtro_situacao) -> dict[int, Decimal]:
    movimentos = _movimentos(conta_ids, filtro_situacao)
    soma = (
        select(movimentos.c.conta_id, func.sum(movimentos.c.efeito).label("total"))
        .group_by(movimentos.c.conta_id)
        .subquery("soma")
    )
    consulta = (
        select(Conta.id, Conta.saldo_inicial + func.coalesce(soma.c.total, 0))
        .select_from(Conta)
        .outerjoin(soma, soma.c.conta_id == Conta.id)
        .where(Conta.id.in_(conta_ids))
    )
    return {conta_id: quantizar(Decimal(valor)) for conta_id, valor in db.execute(consulta)}


def saldos_atuais(db: Session, conta_ids: list[int]) -> dict[int, Decimal]:
    if not conta_ids:
        return {}
    return _saldos(db, conta_ids, Lancamento.situacao == "confirmada")


def saldos_previstos(db: Session, conta_ids: list[int], ate: date) -> dict[int, Decimal]:
    if not conta_ids:
        return {}
    filtro = or_(
        Lancamento.situacao == "confirmada",
        (Lancamento.situacao == "prevista") & (Lancamento.data <= ate),
    )
    saldos = _saldos(db, conta_ids, filtro)
    ajustes = ganchos.ajuste_cartao_previsto(db, conta_ids, ate)
    return {c: quantizar(v - ajustes[c]) for c, v in saldos.items()}


def situacao_exibida(situacao: str, data: date, hoje: date) -> str:
    if situacao == "confirmada":
        return "confirmada"
    if data < hoje:
        return "atrasada"
    return "prevista"


def eh_aporte(lancamento: Lancamento, conta_origem: Conta, conta_destino: Conta) -> bool:
    return (
        lancamento.tipo == "transferencia"
        and conta_origem.usuario_id is not None
        and conta_destino.casal_id is not None
    )
