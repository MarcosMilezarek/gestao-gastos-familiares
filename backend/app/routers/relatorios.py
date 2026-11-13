from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends

from app.acesso import Contexto
from app.deps import DbSessao, get_contexto
from app.schemas.relatorios import (
    RelatorioBalancoMensal,
    RelatorioCategorias,
    RelatorioConta,
    RelatorioDono,
    RelatorioProporcao,
)
from app.services import relatorios
from app.tempo import hoje, mes_ref, validar_mes

router = APIRouter(prefix="/api")

ContextoAtual = Annotated[Contexto, Depends(get_contexto)]


def _mes_consulta(mes: str | None) -> date:
    return mes_ref(hoje()) if mes is None else validar_mes(mes, hoje())


@router.get("/relatorios/despesas-por-categoria", response_model=RelatorioCategorias)
def despesas_por_categoria(
    ctx: ContextoAtual, db: DbSessao, mes: str | None = None
) -> RelatorioCategorias:
    return relatorios.categorias(db, ctx, _mes_consulta(mes))


@router.get("/relatorios/despesas-por-dono", response_model=RelatorioDono)
def despesas_por_dono(
    ctx: ContextoAtual, db: DbSessao, mes: str | None = None
) -> RelatorioDono:
    return relatorios.despesas_por_dono(db, ctx, _mes_consulta(mes))


@router.get("/relatorios/despesas-por-conta", response_model=RelatorioConta)
def despesas_por_conta(
    ctx: ContextoAtual, db: DbSessao, mes: str | None = None
) -> RelatorioConta:
    return relatorios.despesas_por_conta(db, ctx, _mes_consulta(mes))


@router.get("/relatorios/balanco-mensal", response_model=RelatorioBalancoMensal)
def balanco_mensal(
    ctx: ContextoAtual, db: DbSessao, mes: str | None = None
) -> RelatorioBalancoMensal:
    return relatorios.balanco_mensal(db, ctx, _mes_consulta(mes))


@router.get("/relatorios/proporcao", response_model=RelatorioProporcao)
def proporcao(
    ctx: ContextoAtual, db: DbSessao, mes: str | None = None
) -> RelatorioProporcao:
    return relatorios.proporcao_mensal(db, ctx, _mes_consulta(mes))
