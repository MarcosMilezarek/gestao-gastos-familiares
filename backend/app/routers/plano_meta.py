from typing import Annotated

from fastapi import APIRouter, Depends

from app.acesso import Contexto
from app.deps import get_contexto
from app.schemas.lancamento import ValorPositivo
from app.schemas.meta import ValorNaoNegativo
from app.schemas.plano_meta import PlanoMetaSaida
from app.services import plano_metas

router = APIRouter(prefix="/api")

ContextoAtual = Annotated[Contexto, Depends(get_contexto)]


@router.get("/plano-de-metas/calculo", response_model=PlanoMetaSaida)
def calcular_plano(
    _: ContextoAtual,
    valor_alvo: ValorPositivo,
    valor_atual: ValorNaoNegativo,
    mes_alvo: str,
) -> dict:
    return plano_metas.calcular(valor_alvo, valor_atual, mes_alvo)
