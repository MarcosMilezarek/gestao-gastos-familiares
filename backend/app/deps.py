from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.acesso import Contexto, contexto_do_usuario
from app.config import get_settings
from app.db import get_db
from app.errors import NAO_AUTENTICADO, ORIGEM_INVALIDA, AppError
from app.models.usuario import Usuario
from app.services.sessao import resolver_sessao

COOKIE_SESSAO = "sid"
_METODOS_QUE_ALTERAM = {"POST", "PATCH", "PUT", "DELETE"}

DbSessao = Annotated[Session, Depends(get_db)]


def get_token(request: Request) -> str:
    token = request.cookies.get(COOKIE_SESSAO)
    if not token:
        raise AppError(401, NAO_AUTENTICADO, "Entre para continuar.")
    return token


def get_usuario(
    token: Annotated[str, Depends(get_token)], db: DbSessao
) -> Usuario:
    usuario = resolver_sessao(db, token)
    if usuario is None:
        raise AppError(401, NAO_AUTENTICADO, "Entre para continuar.")
    return usuario


def get_contexto(
    usuario: Annotated[Usuario, Depends(get_usuario)], db: DbSessao
) -> Contexto:
    return contexto_do_usuario(db, usuario.id)


def verificar_origem(request: Request) -> None:
    if request.method not in _METODOS_QUE_ALTERAM:
        return
    origem = request.headers.get("origin")
    if origem is None:
        return
    if origem not in get_settings().ORIGENS_PERMITIDAS:
        raise AppError(403, ORIGEM_INVALIDA, "Origem da requisição não permitida.")
