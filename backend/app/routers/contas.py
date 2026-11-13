from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends

from app.acesso import Contexto
from app.deps import DbSessao, get_contexto
from app.schemas.conta import ContaEdicaoEntrada, ContaSaida, ContasSaida, ReajusteSaida
from app.schemas.lancamento import ReajusteEntrada
from app.services.contas import arquivar, desarquivar, editar, listar, obter, reajustar
from app.tempo import hoje, mes_ref, validar_mes

router = APIRouter(prefix="/api")

ContextoAtual = Annotated[Contexto, Depends(get_contexto)]


def _mes_da_consulta(mes: str | None) -> date:
    if mes is None:
        return mes_ref(hoje())
    return validar_mes(mes, hoje())


@router.get("/contas", response_model=ContasSaida)
def listar_contas(
    ctx: ContextoAtual,
    db: DbSessao,
    mes: str | None = None,
    arquivadas: bool = False,
) -> ContasSaida:
    return listar(db, ctx, _mes_da_consulta(mes), arquivadas)


@router.get("/contas/{conta_id}", response_model=ContaSaida)
def obter_conta(
    conta_id: int, ctx: ContextoAtual, db: DbSessao, mes: str | None = None
) -> ContaSaida:
    return obter(db, ctx, conta_id, _mes_da_consulta(mes))


@router.patch("/contas/{conta_id}", response_model=ContaSaida)
def editar_conta(
    conta_id: int, dados: ContaEdicaoEntrada, ctx: ContextoAtual, db: DbSessao
) -> ContaSaida:
    return editar(db, ctx, conta_id, dados)


@router.post("/contas/{conta_id}/arquivar", response_model=ContaSaida)
def arquivar_conta(conta_id: int, ctx: ContextoAtual, db: DbSessao) -> ContaSaida:
    return arquivar(db, ctx, conta_id)


@router.post("/contas/{conta_id}/desarquivar", response_model=ContaSaida)
def desarquivar_conta(conta_id: int, ctx: ContextoAtual, db: DbSessao) -> ContaSaida:
    return desarquivar(db, ctx, conta_id)


@router.post("/contas/{conta_id}/reajuste", response_model=ReajusteSaida)
def reajustar_conta(
    conta_id: int, dados: ReajusteEntrada, ctx: ContextoAtual, db: DbSessao
) -> ReajusteSaida:
    return reajustar(db, ctx, conta_id, dados.saldo_real)
