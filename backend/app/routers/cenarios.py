from typing import Annotated

from fastapi import APIRouter, Depends

from app.acesso import Contexto
from app.deps import DbSessao, get_contexto
from app.schemas.cenario import (
    CenarioEdicao,
    CenarioEntrada,
    CenarioResumo,
    CenarioSaida,
    ItemEdicao,
    ItemEntrada,
)
from app.services import cenarios

router = APIRouter(prefix="/api")

ContextoAtual = Annotated[Contexto, Depends(get_contexto)]


@router.get("/cenarios", response_model=list[CenarioResumo])
def listar_cenarios(ctx: ContextoAtual, db: DbSessao) -> list[dict]:
    return cenarios.listar(db, ctx)


@router.post("/cenarios", status_code=201, response_model=CenarioSaida)
def criar_cenario(dados: CenarioEntrada, ctx: ContextoAtual, db: DbSessao) -> dict:
    return cenarios.criar(db, ctx, dados)


@router.get("/cenarios/{cenario_id}", response_model=CenarioSaida)
def obter_cenario(cenario_id: int, ctx: ContextoAtual, db: DbSessao) -> dict:
    return cenarios.detalhe(db, ctx, cenario_id)


@router.patch("/cenarios/{cenario_id}", response_model=CenarioSaida)
def editar_cenario(
    cenario_id: int, dados: CenarioEdicao, ctx: ContextoAtual, db: DbSessao
) -> dict:
    return cenarios.editar(db, ctx, cenario_id, dados)


@router.delete("/cenarios/{cenario_id}", status_code=204)
def excluir_cenario(cenario_id: int, ctx: ContextoAtual, db: DbSessao) -> None:
    cenarios.excluir(db, ctx, cenario_id)


@router.post("/cenarios/{cenario_id}/itens", status_code=201, response_model=CenarioSaida)
def criar_item(
    cenario_id: int, dados: ItemEntrada, ctx: ContextoAtual, db: DbSessao
) -> dict:
    return cenarios.criar_item(db, ctx, cenario_id, dados)


@router.patch("/cenarios/{cenario_id}/itens/{item_id}", response_model=CenarioSaida)
def editar_item(
    cenario_id: int, item_id: int, dados: ItemEdicao, ctx: ContextoAtual, db: DbSessao
) -> dict:
    return cenarios.editar_item(db, ctx, cenario_id, item_id, dados)


@router.delete("/cenarios/{cenario_id}/itens/{item_id}", response_model=CenarioSaida)
def excluir_item(cenario_id: int, item_id: int, ctx: ContextoAtual, db: DbSessao) -> dict:
    return cenarios.excluir_item(db, ctx, cenario_id, item_id)
