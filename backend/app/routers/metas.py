from typing import Annotated

from fastapi import APIRouter, Depends

from app.acesso import Contexto
from app.deps import DbSessao, get_contexto
from app.schemas.meta import MetaDetalhe, MetaEdicao, MetaEntrada, MetaSaida, MetasSaida
from app.services import metas

router = APIRouter(prefix="/api")

ContextoAtual = Annotated[Contexto, Depends(get_contexto)]


@router.get("/metas", response_model=MetasSaida)
def listar_metas(ctx: ContextoAtual, db: DbSessao) -> dict:
    return metas.listar(db, ctx)


@router.post("/metas", status_code=201, response_model=MetaSaida)
def criar_meta(dados: MetaEntrada, ctx: ContextoAtual, db: DbSessao) -> dict:
    return metas.criar(db, ctx, dados)


@router.get("/metas/{meta_id}", response_model=MetaDetalhe)
def obter_meta(meta_id: int, ctx: ContextoAtual, db: DbSessao) -> dict:
    return metas.detalhe(db, ctx, meta_id)


@router.patch("/metas/{meta_id}", response_model=MetaSaida)
def editar_meta(meta_id: int, dados: MetaEdicao, ctx: ContextoAtual, db: DbSessao) -> dict:
    return metas.editar(db, ctx, meta_id, dados)


@router.delete("/metas/{meta_id}", status_code=204)
def excluir_meta(meta_id: int, ctx: ContextoAtual, db: DbSessao) -> None:
    metas.excluir(db, ctx, meta_id)
