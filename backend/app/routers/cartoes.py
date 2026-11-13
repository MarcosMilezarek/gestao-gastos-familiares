from typing import Annotated

from fastapi import APIRouter, Depends

from app.acesso import Contexto
from app.deps import DbSessao, get_contexto
from app.schemas.cartao import CartaoEdicao, CartaoEntrada, CartaoSaida, CartoesSaida
from app.services.cartoes import criar, editar, excluir, listar, obter

router = APIRouter(prefix="/api")

ContextoAtual = Annotated[Contexto, Depends(get_contexto)]


@router.get("/cartoes", response_model=CartoesSaida)
def listar_cartoes(ctx: ContextoAtual, db: DbSessao, arquivadas: bool = False) -> CartoesSaida:
    return listar(db, ctx, arquivadas)


@router.post("/cartoes", status_code=201, response_model=CartaoSaida)
def criar_cartao(dados: CartaoEntrada, ctx: ContextoAtual, db: DbSessao) -> CartaoSaida:
    return criar(db, ctx, dados)


@router.get("/cartoes/{cartao_id}", response_model=CartaoSaida)
def obter_cartao(cartao_id: int, ctx: ContextoAtual, db: DbSessao) -> CartaoSaida:
    return obter(db, ctx, cartao_id)


@router.patch("/cartoes/{cartao_id}", response_model=CartaoSaida)
def editar_cartao(
    cartao_id: int, dados: CartaoEdicao, ctx: ContextoAtual, db: DbSessao
) -> CartaoSaida:
    return editar(db, ctx, cartao_id, dados)


@router.delete("/cartoes/{cartao_id}", status_code=204)
def excluir_cartao(cartao_id: int, ctx: ContextoAtual, db: DbSessao) -> None:
    excluir(db, ctx, cartao_id)
