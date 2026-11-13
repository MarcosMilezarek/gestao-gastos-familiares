from typing import Annotated

from fastapi import APIRouter, Depends

from app.acesso import Contexto
from app.deps import DbSessao, get_contexto
from app.schemas.categoria import TagEntrada, TagSaida
from app.services import tags

router = APIRouter(prefix="/api")

ContextoAtual = Annotated[Contexto, Depends(get_contexto)]


@router.get("/tags", response_model=list[TagSaida])
def listar_tags(ctx: ContextoAtual, db: DbSessao) -> list[dict]:
    return tags.listar(db, ctx)


@router.post("/tags", status_code=201, response_model=TagSaida)
def criar_tag(dados: TagEntrada, ctx: ContextoAtual, db: DbSessao) -> dict:
    return tags.criar(db, ctx, dados.nome)


@router.patch("/tags/{tag_id}", response_model=TagSaida)
def renomear_tag(tag_id: int, dados: TagEntrada, ctx: ContextoAtual, db: DbSessao) -> dict:
    return tags.renomear(db, ctx, tag_id, dados.nome)


@router.delete("/tags/{tag_id}", status_code=204)
def excluir_tag(tag_id: int, ctx: ContextoAtual, db: DbSessao) -> None:
    tags.excluir(db, ctx, tag_id)
