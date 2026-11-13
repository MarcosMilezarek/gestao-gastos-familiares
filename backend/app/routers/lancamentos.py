from typing import Annotated

from fastapi import APIRouter, Depends

from app.acesso import Contexto
from app.deps import DbSessao, get_contexto
from app.schemas.lancamento import (
    Alcance,
    ConfirmarEntrada,
    LancamentoEdicaoEntrada,
    LancamentoEntrada,
    LancamentoSaida,
)
from app.services.lancamentos import (
    confirmar,
    criar,
    editar,
    excluir,
    listar_mes,
    obter,
)
from app.tempo import hoje, mes_ref, validar_mes

router = APIRouter(prefix="/api")

ContextoAtual = Annotated[Contexto, Depends(get_contexto)]


@router.get("/lancamentos", response_model=list[LancamentoSaida])
def listar_lancamentos(
    ctx: ContextoAtual,
    db: DbSessao,
    mes: str | None = None,
    conta_id: int | None = None,
) -> list[LancamentoSaida]:
    mes_consulta = mes_ref(hoje()) if mes is None else validar_mes(mes, hoje())
    return listar_mes(db, ctx, mes_consulta, conta_id)


@router.get("/lancamentos/{lancamento_id}", response_model=LancamentoSaida)
def obter_lancamento(lancamento_id: int, ctx: ContextoAtual, db: DbSessao) -> LancamentoSaida:
    return obter(db, ctx, lancamento_id)


@router.post("/lancamentos", status_code=201, response_model=LancamentoSaida)
def criar_lancamento(
    dados: LancamentoEntrada, ctx: ContextoAtual, db: DbSessao
) -> LancamentoSaida:
    return criar(db, ctx, dados)


@router.patch("/lancamentos/{lancamento_id}", response_model=LancamentoSaida)
def editar_lancamento(
    lancamento_id: int,
    dados: LancamentoEdicaoEntrada,
    ctx: ContextoAtual,
    db: DbSessao,
    alcance: Alcance | None = None,
) -> LancamentoSaida:
    return editar(db, ctx, lancamento_id, dados, alcance)


@router.delete("/lancamentos/{lancamento_id}", status_code=204)
def excluir_lancamento(
    lancamento_id: int,
    ctx: ContextoAtual,
    db: DbSessao,
    alcance: Alcance | None = None,
) -> None:
    excluir(db, ctx, lancamento_id, alcance)


@router.post("/lancamentos/{lancamento_id}/confirmar", response_model=LancamentoSaida)
def confirmar_lancamento(
    lancamento_id: int,
    ctx: ContextoAtual,
    db: DbSessao,
    dados: ConfirmarEntrada | None = None,
) -> LancamentoSaida:
    return confirmar(db, ctx, lancamento_id, dados.valor if dados is not None else None)
