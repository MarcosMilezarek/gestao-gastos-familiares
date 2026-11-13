from typing import Annotated

from fastapi import APIRouter, Depends

from app.acesso import Contexto
from app.deps import DbSessao, get_contexto
from app.schemas.inicio import InicioSaida
from app.services.inicio import montar

router = APIRouter(prefix="/api")

ContextoAtual = Annotated[Contexto, Depends(get_contexto)]


@router.get("/inicio", response_model=InicioSaida)
def obter_inicio(ctx: ContextoAtual, db: DbSessao) -> InicioSaida:
    return montar(db, ctx)
