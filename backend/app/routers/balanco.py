from typing import Annotated

from fastapi import APIRouter, Depends

from app.acesso import Contexto
from app.deps import DbSessao, get_contexto
from app.schemas.balanco import BalancoMes
from app.services.balanco import calcular
from app.tempo import hoje, mes_ref, validar_mes

router = APIRouter(prefix="/api")

ContextoAtual = Annotated[Contexto, Depends(get_contexto)]


@router.get("/balanco", response_model=BalancoMes)
def obter_balanco(
    ctx: ContextoAtual, db: DbSessao, mes: str | None = None
) -> BalancoMes:
    mes_consulta = mes_ref(hoje()) if mes is None else validar_mes(mes, hoje())
    return calcular(db, ctx, mes_consulta)
