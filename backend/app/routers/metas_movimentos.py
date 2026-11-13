from typing import Annotated

from fastapi import APIRouter, Depends

from app.acesso import Contexto
from app.deps import DbSessao, get_contexto
from app.schemas.lancamento import LancamentoSaida
from app.schemas.meta_movimento import (
    MovimentoEntrada,
    RendimentoEdicao,
    RendimentoEntrada,
    RendimentoResultado,
    RendimentoSaida,
)
from app.services import metas_movimentos

router = APIRouter(prefix="/api")

ContextoAtual = Annotated[Contexto, Depends(get_contexto)]


@router.post("/metas/{meta_id}/aplicacoes", status_code=201, response_model=LancamentoSaida)
def aplicar(meta_id: int, dados: MovimentoEntrada, ctx: ContextoAtual, db: DbSessao) -> dict:
    return metas_movimentos.aplicar(db, ctx, meta_id, dados)


@router.post("/metas/{meta_id}/resgates", status_code=201, response_model=LancamentoSaida)
def resgatar(meta_id: int, dados: MovimentoEntrada, ctx: ContextoAtual, db: DbSessao) -> dict:
    return metas_movimentos.resgatar(db, ctx, meta_id, dados)


@router.post("/metas/{meta_id}/rendimentos", response_model=RendimentoResultado)
def atualizar_valor(
    meta_id: int, dados: RendimentoEntrada, ctx: ContextoAtual, db: DbSessao
) -> dict:
    return metas_movimentos.atualizar_valor(db, ctx, meta_id, dados)


@router.patch(
    "/metas/{meta_id}/rendimentos/{rendimento_id}", response_model=RendimentoSaida
)
def editar_rendimento(
    meta_id: int, rendimento_id: int, dados: RendimentoEdicao, ctx: ContextoAtual, db: DbSessao
) -> dict:
    return metas_movimentos.editar_rendimento(db, ctx, meta_id, rendimento_id, dados)


@router.delete("/metas/{meta_id}/rendimentos/{rendimento_id}", status_code=204)
def excluir_rendimento(meta_id: int, rendimento_id: int, ctx: ContextoAtual, db: DbSessao) -> None:
    metas_movimentos.excluir_rendimento(db, ctx, meta_id, rendimento_id)
