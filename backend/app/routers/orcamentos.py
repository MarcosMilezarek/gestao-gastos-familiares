from typing import Annotated

from fastapi import APIRouter, Body, Depends

from app import tempo
from app.acesso import Contexto
from app.deps import DbSessao, get_contexto
from app.schemas.orcamento import (
    ComparacaoSaida,
    OrcamentoEntrada,
    OrcamentoMesSaida,
    OrcamentoSaida,
)
from app.services import orcamento_comparacao, orcamentos

router = APIRouter(prefix="/api")

ContextoAtual = Annotated[Contexto, Depends(get_contexto)]


@router.get("/orcamentos/{mes}", response_model=OrcamentoMesSaida)
def obter_orcamento(mes: str, ctx: ContextoAtual, db: DbSessao) -> OrcamentoMesSaida:
    tempo.validar_mes(mes, tempo.hoje())
    return orcamentos.obter(db, ctx, mes)


@router.post("/orcamentos/{mes}", status_code=201, response_model=OrcamentoSaida)
def criar_orcamento(
    mes: str, dados: OrcamentoEntrada, ctx: ContextoAtual, db: DbSessao
) -> OrcamentoSaida:
    tempo.validar_mes(mes, tempo.hoje())
    return orcamentos.criar(db, ctx, mes, dados)


@router.put("/orcamentos/{mes}", response_model=OrcamentoSaida)
def substituir_orcamento(
    mes: str, dados: OrcamentoEntrada, ctx: ContextoAtual, db: DbSessao
) -> OrcamentoSaida:
    tempo.validar_mes(mes, tempo.hoje())
    return orcamentos.substituir(db, ctx, mes, dados)


@router.delete("/orcamentos/{mes}", status_code=204)
def excluir_orcamento(mes: str, ctx: ContextoAtual, db: DbSessao) -> None:
    tempo.validar_mes(mes, tempo.hoje())
    orcamentos.excluir(db, ctx, mes)


@router.post(
    "/orcamentos/{mes}/copiar-do-anterior", status_code=201, response_model=OrcamentoSaida
)
def copiar_orcamento_do_anterior(
    mes: str,
    ctx: ContextoAtual,
    db: DbSessao,
    substituir: Annotated[bool, Body(embed=True)] = False,
) -> OrcamentoSaida:
    tempo.validar_mes(mes, tempo.hoje())
    return orcamentos.copiar_do_anterior(db, ctx, mes, substituir)


@router.get("/orcamentos/{mes}/comparacao", response_model=ComparacaoSaida)
def comparar_orcamento(mes: str, ctx: ContextoAtual, db: DbSessao) -> ComparacaoSaida:
    tempo.validar_mes(mes, tempo.hoje())
    return orcamento_comparacao.comparar(db, ctx, mes)


@router.post("/previa-orcamento", response_model=OrcamentoSaida)
def previa_orcamento(dados: OrcamentoEntrada, ctx: ContextoAtual, db: DbSessao) -> OrcamentoSaida:
    return orcamentos.previa(db, ctx, dados)
