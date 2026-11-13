from typing import Annotated

from fastapi import APIRouter, Depends

from app.acesso import Contexto
from app.deps import DbSessao, get_contexto
from app.schemas.categoria import (
    ArquivarEntrada,
    CategoriaEdicao,
    CategoriaEntrada,
    CategoriaSaida,
    MoverLancamentosEntrada,
    MovidosSaida,
    Tipo,
)
from app.services import categorias

router = APIRouter(prefix="/api")

ContextoAtual = Annotated[Contexto, Depends(get_contexto)]


@router.get("/categorias", response_model=list[CategoriaSaida])
def listar_categorias(
    ctx: ContextoAtual,
    db: DbSessao,
    tipo: Tipo | None = None,
    incluir_arquivadas: bool = False,
) -> list[dict]:
    return categorias.listar(db, ctx, tipo, incluir_arquivadas)


@router.post("/categorias", status_code=201, response_model=CategoriaSaida)
def criar_categoria(dados: CategoriaEntrada, ctx: ContextoAtual, db: DbSessao) -> dict:
    return categorias.criar(
        db,
        ctx,
        tipo=dados.tipo,
        nome=dados.nome,
        icone=dados.icone,
        cor=dados.cor,
        categoria_pai_id=dados.categoria_pai_id,
    )


@router.patch("/categorias/{categoria_id}", response_model=CategoriaSaida)
def editar_categoria(
    categoria_id: int, dados: CategoriaEdicao, ctx: ContextoAtual, db: DbSessao
) -> dict:
    return categorias.editar(
        db,
        ctx,
        categoria_id,
        nome=dados.nome,
        icone=dados.icone,
        cor=dados.cor,
    )


@router.post("/categorias/{categoria_id}/arquivar", response_model=CategoriaSaida)
def arquivar_categoria(
    categoria_id: int, ctx: ContextoAtual, db: DbSessao, dados: ArquivarEntrada | None = None
) -> dict:
    return categorias.arquivar(db, ctx, categoria_id, dados.mover_para_id if dados else None)


@router.post("/categorias/{categoria_id}/mover-lancamentos", response_model=MovidosSaida)
def mover_lancamentos_categoria(
    categoria_id: int, dados: MoverLancamentosEntrada, ctx: ContextoAtual, db: DbSessao
) -> dict:
    return categorias.mover_lancamentos(db, ctx, categoria_id, dados.destino_id)
