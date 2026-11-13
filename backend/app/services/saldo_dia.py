from collections import defaultdict
from collections.abc import Iterable
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import tempo
from app.models.cartao import Cartao
from app.models.conta import Conta
from app.money import quantizar
from app.services import faturas, saldos


def _faturas_sem_pagamento(
    db: Session, conta_ids: list[int], mes: date
) -> list[faturas.FaturaCalculada]:
    cartao_ids = list(db.scalars(select(Cartao.id).where(Cartao.conta_id.in_(conta_ids))))
    if not cartao_ids:
        return []
    calculadas = faturas.calcular(db, cartao_ids, ate_mes=mes)
    return [
        fatura
        for faturas_do_cartao in calculadas.values()
        for fatura in faturas_do_cartao
        if fatura.total > 0 and fatura.pagamento is None
    ]


def saldo_fim_do_dia(
    db: Session, conta_ids: list[int], mes: date, datas_com_item: Iterable[date]
) -> dict[date, Decimal]:
    if not conta_ids:
        return {data: Decimal("0.00") for data in datas_com_item}
    fim = tempo.fim_do_mes(mes)
    saldos_iniciais = db.scalars(select(Conta.saldo_inicial).where(Conta.id.in_(conta_ids)))
    abertura = sum(saldos_iniciais, Decimal("0.00"))
    abertura += sum(
        (
            efeito
            for _, efeito in saldos.efeitos_por_data(
                db, conta_ids, None, mes - timedelta(days=1)
            )
        ),
        Decimal("0.00"),
    )
    pendentes = _faturas_sem_pagamento(db, conta_ids, mes)
    abertura -= sum((f.total for f in pendentes if f.vencimento < mes), Decimal("0.00"))

    variacao: dict[date, Decimal] = defaultdict(Decimal)
    for data, efeito in saldos.efeitos_por_data(db, conta_ids, mes, fim):
        variacao[data] += efeito
    for fatura in pendentes:
        if mes <= fatura.vencimento <= fim:
            variacao[fatura.vencimento] -= fatura.total

    resultado: dict[date, Decimal] = {}
    for data in datas_com_item:
        acumulado = abertura + sum(
            (valor for dia, valor in variacao.items() if dia <= data), Decimal("0.00")
        )
        resultado[data] = quantizar(acumulado)
    return resultado
