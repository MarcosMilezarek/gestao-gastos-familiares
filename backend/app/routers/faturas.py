from datetime import date
from typing import Annotated

from fastapi import APIRouter, Body, Depends

from app.acesso import Contexto
from app.deps import DbSessao, get_contexto
from app.schemas.item_fatura import (
    AjusteEntrada,
    AjusteSaida,
    CompraEntrada,
    EstornoEntrada,
    FaturaSaida,
    ItemEdicaoEntrada,
    ItemFaturaSaida,
)
from app.schemas.lancamento import Alcance
from app.services import itens_fatura, pagamento_fatura
from app.tempo import hoje, validar_mes

router = APIRouter(prefix="/api")

ContextoAtual = Annotated[Contexto, Depends(get_contexto)]


@router.get("/cartoes/{cartao_id}/faturas")
def listar_faturas(
    cartao_id: int,
    ctx: ContextoAtual,
    db: DbSessao,
    de: str | None = None,
    ate: str | None = None,
    data: date | None = None,
) -> dict:
    return itens_fatura.janela(db, ctx, cartao_id, de, ate, data)


@router.get("/cartoes/{cartao_id}/faturas/{mes}", response_model=FaturaSaida)
def obter_fatura(cartao_id: int, mes: str, ctx: ContextoAtual, db: DbSessao) -> FaturaSaida:
    return itens_fatura.detalhe(db, ctx, cartao_id, validar_mes(mes, hoje()))


@router.post("/cartoes/{cartao_id}/compras", status_code=201, response_model=ItemFaturaSaida)
def criar_compra(
    cartao_id: int, dados: CompraEntrada, ctx: ContextoAtual, db: DbSessao
) -> ItemFaturaSaida:
    return itens_fatura.criar_compra(db, ctx, cartao_id, dados.model_dump())


@router.post("/cartoes/{cartao_id}/estornos", status_code=201, response_model=ItemFaturaSaida)
def criar_estorno(
    cartao_id: int, dados: EstornoEntrada, ctx: ContextoAtual, db: DbSessao
) -> ItemFaturaSaida:
    return itens_fatura.criar_estorno(db, ctx, cartao_id, dados.model_dump())


@router.post("/cartoes/{cartao_id}/faturas/{mes}/ajuste", response_model=AjusteSaida)
def ajustar_fatura(
    cartao_id: int, mes: str, dados: AjusteEntrada, ctx: ContextoAtual, db: DbSessao
) -> AjusteSaida:
    mes_ref = validar_mes(mes, hoje())
    return itens_fatura.ajustar(db, ctx, cartao_id, mes_ref, dados.valor_banco)


@router.get("/itens-fatura/{item_id}", response_model=ItemFaturaSaida)
def obter_item_fatura(item_id: int, ctx: ContextoAtual, db: DbSessao) -> ItemFaturaSaida:
    return itens_fatura.obter(db, ctx, item_id)


@router.patch("/itens-fatura/{item_id}", response_model=ItemFaturaSaida)
def editar_item_fatura(
    item_id: int,
    dados: ItemEdicaoEntrada,
    ctx: ContextoAtual,
    db: DbSessao,
    alcance: Alcance | None = None,
) -> ItemFaturaSaida:
    return itens_fatura.editar(db, ctx, item_id, dados, alcance)


@router.delete("/itens-fatura/{item_id}", status_code=204)
def excluir_item_fatura(
    item_id: int,
    ctx: ContextoAtual,
    db: DbSessao,
    alcance: Alcance | None = None,
) -> None:
    itens_fatura.excluir(db, ctx, item_id, alcance)


@router.post(
    "/cartoes/{cartao_id}/faturas/{mes}/pagamento",
    status_code=201,
    response_model=FaturaSaida,
)
def pagar_fatura(
    cartao_id: int,
    mes: str,
    ctx: ContextoAtual,
    db: DbSessao,
    data: Annotated[date | None, Body(embed=True)] = None,
) -> FaturaSaida:
    mes_ref = validar_mes(mes, hoje())
    pagamento_fatura.pagar(db, ctx, cartao_id, mes_ref, data)
    return itens_fatura.detalhe(db, ctx, cartao_id, mes_ref)


@router.delete("/cartoes/{cartao_id}/faturas/{mes}/pagamento", status_code=204)
def desfazer_pagamento_fatura(cartao_id: int, mes: str, ctx: ContextoAtual, db: DbSessao) -> None:
    pagamento_fatura.desfazer(db, ctx, cartao_id, validar_mes(mes, hoje()))


@router.post(
    "/cartoes/{cartao_id}/faturas/{mes}/pagamento/confirmar",
    response_model=FaturaSaida,
)
def confirmar_pagamento_fatura(
    cartao_id: int, mes: str, ctx: ContextoAtual, db: DbSessao
) -> FaturaSaida:
    mes_ref = validar_mes(mes, hoje())
    pagamento_fatura.confirmar(db, ctx, cartao_id, mes_ref)
    return itens_fatura.detalhe(db, ctx, cartao_id, mes_ref)
