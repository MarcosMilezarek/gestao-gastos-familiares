from typing import Annotated

from fastapi import APIRouter, Depends

from app.acesso import Contexto
from app.deps import DbSessao, get_contexto
from app.schemas.projecao import ProjecaoSaida
from app.services.projecao import calcular

router = APIRouter(prefix="/api")

ContextoAtual = Annotated[Contexto, Depends(get_contexto)]


@router.get("/projecao", response_model=ProjecaoSaida)
def obter_projecao(
    ctx: ContextoAtual, db: DbSessao, horizonte: int = 6, conta_id: int | None = None
) -> ProjecaoSaida:
    return calcular(db, ctx, horizonte, conta_id)
