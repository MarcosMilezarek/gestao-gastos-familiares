from typing import Annotated

from fastapi import APIRouter, Depends

from app.acesso import Contexto
from app.deps import DbSessao, get_contexto
from app.schemas.vinculo import (
    ConviteEntrada,
    ConviteEnviadoSaida,
    DesvincularEntrada,
    VinculoSaida,
)
from app.services.vinculo import (
    aceitar_convite,
    cancelar_convite,
    convidar,
    desvincular,
    estado_do_vinculo,
    recusar_convite,
)

router = APIRouter(prefix="/api")

ContextoAtual = Annotated[Contexto, Depends(get_contexto)]


@router.get("/vinculo", response_model=VinculoSaida)
def obter_vinculo(ctx: ContextoAtual, db: DbSessao) -> dict:
    return estado_do_vinculo(db, ctx)


@router.post("/convites", status_code=201, response_model=ConviteEnviadoSaida)
def enviar_convite(dados: ConviteEntrada, ctx: ContextoAtual, db: DbSessao) -> dict:
    convite = convidar(db, ctx, dados.email)
    return {"id": convite.id, "email_convidado": dados.email}


@router.delete("/convites/{convite_id}", status_code=204)
def cancelar(convite_id: int, ctx: ContextoAtual, db: DbSessao) -> None:
    cancelar_convite(db, ctx, convite_id)


@router.post("/convites/{convite_id}/aceitar", response_model=VinculoSaida)
def aceitar(convite_id: int, ctx: ContextoAtual, db: DbSessao) -> dict:
    return aceitar_convite(db, ctx, convite_id)


@router.post("/convites/{convite_id}/recusar", response_model=VinculoSaida)
def recusar(convite_id: int, ctx: ContextoAtual, db: DbSessao) -> dict:
    recusar_convite(db, ctx, convite_id)
    # Recusar não muda o casal: o contexto da requisição continua válido para montar o estado.
    return estado_do_vinculo(db, ctx)


@router.post("/vinculo/desvincular", response_model=VinculoSaida)
def desvincular_casal(dados: DesvincularEntrada, ctx: ContextoAtual, db: DbSessao) -> dict:
    return desvincular(db, ctx, dados.confirmar)
