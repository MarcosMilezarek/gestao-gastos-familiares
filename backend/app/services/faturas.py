from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.dialects.mysql import insert
from sqlalchemy.orm import Session

from app import tempo
from app.acesso import Contexto, cartao_visivel, filtro_contas
from app.errors import CONTA_ARQUIVADA, AppError
from app.models.cartao import Cartao, Fatura
from app.models.conta import Conta
from app.models.item_fatura import ItemFatura, SerieCartao
from app.models.lancamento import Lancamento
from app.services.fatura_calculo import (
    EntradaFatura,
    TotalFatura,
    datas_da_fatura,
    status_fatura,
    totais_em_cadeia,
)

_ZERO = Decimal(0)


@dataclass(frozen=True)
class PagamentoInfo:
    lancamento_id: int
    data: date
    situacao: str
    valor: Decimal


@dataclass(frozen=True)
class GastoCartao:
    cartao_id: int
    conta_id: int
    categoria_id: int | None
    status: str
    paga: bool
    total: Decimal


@dataclass(frozen=True)
class FaturaCalculada:
    cartao_id: int
    conta_id: int
    mes: date
    id: int | None
    fechamento: date
    vencimento: date
    bruto: Decimal
    total: Decimal
    credito_recebido: Decimal
    credito_repassado: Decimal
    status: str
    tem_itens: bool
    pagamento: PagamentoInfo | None


def _linhas_faturas(
    db: Session,
    cartao_ids: list[int],
    ate_mes: date | None,
    mes_corte_recorrente: date | None,
):
    condicao = ItemFatura.fatura_id == Fatura.id
    if mes_corte_recorrente is not None:
        recorrentes = select(SerieCartao.id).where(SerieCartao.tipo == "recorrente")
        condicao = and_(
            condicao,
            or_(
                Fatura.mes_ref <= mes_corte_recorrente,
                ItemFatura.serie_id.is_(None),
                ItemFatura.serie_id.not_in(recorrentes),
            ),
        )
    bruto = func.coalesce(
        func.sum(case((ItemFatura.tipo == "estorno", -ItemFatura.valor), else_=ItemFatura.valor)),
        0,
    )
    consulta = (
        select(
            Fatura.id,
            Fatura.cartao_id,
            Fatura.mes_ref,
            bruto.label("bruto"),
            func.count(ItemFatura.id).label("itens"),
        )
        .select_from(Fatura)
        .outerjoin(ItemFatura, condicao)
        .where(Fatura.cartao_id.in_(cartao_ids))
        .group_by(Fatura.id, Fatura.cartao_id, Fatura.mes_ref)
        .order_by(Fatura.cartao_id, Fatura.mes_ref)
    )
    if ate_mes is not None:
        consulta = consulta.where(Fatura.mes_ref <= ate_mes)
    return db.execute(consulta).all()


def calcular(
    db: Session,
    cartao_ids: list[int],
    *,
    ate_mes: date | None = None,
    mes_corte_recorrente: date | None = None,
    hoje: date | None = None,
) -> dict[int, list[FaturaCalculada]]:
    if not cartao_ids:
        return {}
    hoje = hoje or tempo.hoje()
    cartoes = {
        c.id: c
        for c in db.scalars(select(Cartao).where(Cartao.id.in_(cartao_ids)))
    }
    linhas = _linhas_faturas(db, cartao_ids, ate_mes, mes_corte_recorrente)
    pagamentos = db.execute(
        select(
            Lancamento.id,
            Lancamento.fatura_id,
            Lancamento.data,
            Lancamento.situacao,
            Lancamento.valor,
        ).where(Lancamento.fatura_id.in_([linha.id for linha in linhas]))
    ).all()
    pagamento_por_fatura = {
        p.fatura_id: PagamentoInfo(
            lancamento_id=p.id,
            data=p.data,
            situacao=p.situacao,
            valor=Decimal(p.valor),
        )
        for p in pagamentos
    }

    linhas_por_cartao: dict[int, list] = {c: [] for c in cartao_ids}
    for linha in linhas:
        linhas_por_cartao[linha.cartao_id].append(linha)

    resultado: dict[int, list[FaturaCalculada]] = {}
    for cartao_id in cartao_ids:
        cartao = cartoes[cartao_id]
        do_cartao = linhas_por_cartao[cartao_id]
        entradas = []
        for linha in do_cartao:
            pagamento = pagamento_por_fatura.get(linha.id)
            confirmado = pagamento is not None and pagamento.situacao == "confirmada"
            entradas.append(
                EntradaFatura(
                    mes=linha.mes_ref,
                    bruto=Decimal(linha.bruto),
                    pago=pagamento.valor if confirmado else None,
                )
            )
        totais: list[TotalFatura] = totais_em_cadeia(entradas)
        faturas = []
        for linha, total in zip(do_cartao, totais, strict=True):
            pagamento = pagamento_por_fatura.get(linha.id)
            paga = pagamento is not None and pagamento.situacao == "confirmada"
            fechamento, vencimento = datas_da_fatura(
                linha.mes_ref, cartao.dia_fechamento, cartao.dia_vencimento
            )
            faturas.append(
                FaturaCalculada(
                    cartao_id=cartao.id,
                    conta_id=cartao.conta_id,
                    mes=linha.mes_ref,
                    id=linha.id,
                    fechamento=fechamento,
                    vencimento=vencimento,
                    bruto=Decimal(linha.bruto),
                    total=total.total,
                    credito_recebido=total.credito_recebido,
                    credito_repassado=total.credito_repassado,
                    status=status_fatura(total.total, paga, hoje, fechamento, vencimento),
                    tem_itens=linha.itens > 0,
                    pagamento=pagamento,
                )
            )
        resultado[cartao_id] = faturas
    return resultado


def fatura_virtual(cartao: Cartao, mes: date, hoje: date) -> FaturaCalculada:
    fechamento, vencimento = datas_da_fatura(mes, cartao.dia_fechamento, cartao.dia_vencimento)
    return FaturaCalculada(
        cartao_id=cartao.id,
        conta_id=cartao.conta_id,
        mes=mes,
        id=None,
        fechamento=fechamento,
        vencimento=vencimento,
        bruto=_ZERO,
        total=_ZERO,
        credito_recebido=_ZERO,
        credito_repassado=_ZERO,
        status=status_fatura(_ZERO, False, hoje, fechamento, vencimento),
        tem_itens=False,
        pagamento=None,
    )


def calcular_mes(
    db: Session, cartao: Cartao, mes: date, hoje: date | None = None
) -> FaturaCalculada:
    hoje = hoje or tempo.hoje()
    faturas = calcular(db, [cartao.id], ate_mes=mes, hoje=hoje)[cartao.id]
    for fatura in faturas:
        if fatura.mes == mes:
            return fatura
    return fatura_virtual(cartao, mes, hoje)


def obter_ou_criar(db: Session, cartao: Cartao, mes: date) -> Fatura:
    db.execute(
        insert(Fatura)
        .values(cartao_id=cartao.id, mes_ref=mes)
        .on_duplicate_key_update(id=Fatura.id)
    )
    return db.scalars(
        select(Fatura).where(Fatura.cartao_id == cartao.id, Fatura.mes_ref == mes)
    ).one()


def faturas_do_mes(
    db: Session, ctx: Contexto, mes: date, conta_ids: list[int] | None = None
) -> list[FaturaCalculada]:
    filtro = filtro_contas(ctx)
    if conta_ids is None:
        filtro = and_(filtro, Conta.arquivado == 0)
    else:
        filtro = and_(filtro, Conta.id.in_(conta_ids))
    cartao_ids = list(
        db.scalars(
            select(Cartao.id).join(Conta, Conta.id == Cartao.conta_id).where(filtro)
        )
    )
    if not cartao_ids:
        return []
    calculadas = calcular(db, cartao_ids, ate_mes=mes)
    return [
        fatura
        for cartao_id in cartao_ids
        for fatura in calculadas[cartao_id]
        if fatura.mes == mes and (fatura.tem_itens or fatura.pagamento is not None)
    ]


def gasto_cartao(db: Session, conta_ids: list[int], mes: date) -> list[GastoCartao]:
    if not conta_ids:
        return []
    total = func.sum(
        case((ItemFatura.tipo == "estorno", -ItemFatura.valor), else_=ItemFatura.valor)
    )
    consulta = (
        select(
            Fatura.cartao_id,
            ItemFatura.conta_id,
            ItemFatura.categoria_id,
            Fatura.id.label("fatura_id"),
            total.label("total"),
        )
        .select_from(ItemFatura)
        .join(Fatura, Fatura.id == ItemFatura.fatura_id)
        .where(ItemFatura.conta_id.in_(conta_ids), Fatura.mes_ref == mes)
        .group_by(
            Fatura.cartao_id, ItemFatura.conta_id, ItemFatura.categoria_id, Fatura.id
        )
    )
    linhas = db.execute(consulta).all()
    if not linhas:
        return []
    calculadas = calcular(db, sorted({linha.cartao_id for linha in linhas}), ate_mes=mes)
    faturas_por_id = {
        fatura.id: fatura
        for faturas_do_cartao in calculadas.values()
        for fatura in faturas_do_cartao
        if fatura.mes == mes
    }
    gastos = []
    for linha in linhas:
        fatura = faturas_por_id[linha.fatura_id]
        gastos.append(
            GastoCartao(
                cartao_id=linha.cartao_id,
                conta_id=linha.conta_id,
                categoria_id=linha.categoria_id,
                status=fatura.status,
                paga=fatura.pagamento is not None and fatura.pagamento.situacao == "confirmada",
                total=Decimal(linha.total),
            )
        )
    return gastos


def sincronizar_pagamentos(db: Session, cartao_id: int) -> None:
    previstos = {
        pagamento.fatura_id: pagamento
        for pagamento in db.scalars(
            select(Lancamento)
            .join(Fatura, Fatura.id == Lancamento.fatura_id)
            .where(Fatura.cartao_id == cartao_id, Lancamento.situacao == "prevista")
        )
    }
    if not previstos:
        return
    for fatura in calcular(db, [cartao_id])[cartao_id]:
        pagamento = previstos.get(fatura.id)
        if pagamento is None:
            continue
        if fatura.total == _ZERO:
            db.delete(pagamento)
        else:
            pagamento.valor = fatura.total


def travar_cartao(db: Session, ctx: Contexto, cartao_id: int, conta_ativa: bool = True) -> Cartao:
    cartao_visivel(db, ctx, cartao_id)
    cartao = db.scalar(
        select(Cartao)
        .where(Cartao.id == cartao_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if conta_ativa and db.get(Conta, cartao.conta_id).arquivado:
        raise AppError(409, CONTA_ARQUIVADA, "Conta arquivada.")
    return cartao


def limite_usado(db: Session, cartao_ids: list[int]) -> dict[int, Decimal]:
    hoje = tempo.hoje()
    usado = {c: _ZERO for c in cartao_ids}
    calculadas = calcular(
        db, cartao_ids, mes_corte_recorrente=tempo.mes_ref(hoje), hoje=hoje
    )
    for cartao_id, faturas in calculadas.items():
        usado[cartao_id] = sum(
            (f.total for f in faturas if f.status != "paga"), _ZERO
        )
    return usado
