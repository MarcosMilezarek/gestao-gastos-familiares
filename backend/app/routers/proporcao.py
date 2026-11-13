from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends

from app.acesso import Contexto
from app.deps import DbSessao, get_contexto
from app.money import para_str
from app.schemas.proporcao import ProporcaoSaida, SugestaoAporteSaida
from app.services.proporcao import proporcao_do_mes, sugestao_aporte
from app.tempo import hoje, mes_ref, validar_mes

router = APIRouter(prefix="/api")

ContextoAtual = Annotated[Contexto, Depends(get_contexto)]


@router.get("/proporcao", response_model=ProporcaoSaida)
def obter_proporcao(
    ctx: ContextoAtual, db: DbSessao, mes: str | None = None
) -> ProporcaoSaida:
    mes_consulta = mes_ref(hoje()) if mes is None else validar_mes(mes, hoje())
    return proporcao_do_mes(db, ctx, mes_consulta)


@router.get("/proporcao/sugestao-aporte", response_model=SugestaoAporteSaida)
def obter_sugestao_aporte(
    conta_origem_id: int, data: date, ctx: ContextoAtual, db: DbSessao
) -> SugestaoAporteSaida:
    valor = sugestao_aporte(db, ctx, conta_origem_id, data)
    return SugestaoAporteSaida(valor=None if valor is None else para_str(valor))
