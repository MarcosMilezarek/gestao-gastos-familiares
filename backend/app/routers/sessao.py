from typing import Annotated

from fastapi import APIRouter, Depends, Response

from app.acesso import contexto_do_usuario
from app.config import get_settings
from app.deps import COOKIE_SESSAO, DbSessao, get_token, get_usuario
from app.models.usuario import Usuario
from app.schemas.sessao import (
    AlterarSenhaEntrada,
    CadastroEntrada,
    LoginEntrada,
    PerfilEntrada,
    SessaoSaida,
    UsuarioSaida,
)
from app.services.sessao import (
    alterar_senha,
    atualizar_perfil,
    cadastrar,
    entrar,
    montar_sessao,
    sair,
)

router = APIRouter(prefix="/api")

Token = Annotated[str, Depends(get_token)]
UsuarioAtual = Annotated[Usuario, Depends(get_usuario)]


def _definir_cookie(response: Response, token: str) -> None:
    configuracao = get_settings()
    response.set_cookie(
        COOKIE_SESSAO,
        token,
        max_age=configuracao.SESSAO_DIAS * 86400,
        httponly=True,
        samesite="lax",
        path="/",
        secure=configuracao.COOKIE_SECURE,
    )


@router.post("/cadastro", status_code=201, response_model=SessaoSaida)
def cadastro(dados: CadastroEntrada, response: Response, db: DbSessao) -> dict:
    usuario, token = cadastrar(db, dados)
    _definir_cookie(response, token)
    return montar_sessao(db, usuario, contexto_do_usuario(db, usuario.id))


@router.post("/sessao", response_model=SessaoSaida)
def login(dados: LoginEntrada, response: Response, db: DbSessao) -> dict:
    usuario, token = entrar(db, dados.email, dados.senha)
    _definir_cookie(response, token)
    return montar_sessao(db, usuario, contexto_do_usuario(db, usuario.id))


@router.get("/sessao", response_model=SessaoSaida)
def sessao_atual(usuario: UsuarioAtual, db: DbSessao) -> dict:
    return montar_sessao(db, usuario, contexto_do_usuario(db, usuario.id))


@router.delete("/sessao", status_code=204, dependencies=[Depends(get_usuario)])
def logout(token: Token, response: Response, db: DbSessao) -> None:
    sair(db, token)
    response.delete_cookie(
        COOKIE_SESSAO,
        path="/",
        httponly=True,
        samesite="lax",
        secure=get_settings().COOKIE_SECURE,
    )


@router.patch("/perfil", response_model=UsuarioSaida)
def editar_perfil(dados: PerfilEntrada, usuario: UsuarioAtual, db: DbSessao) -> UsuarioSaida:
    atualizado = atualizar_perfil(db, usuario, nome=dados.nome, tema=dados.tema)
    return UsuarioSaida.model_validate(atualizado, from_attributes=True)


@router.post("/perfil/senha", status_code=204)
def trocar_senha(
    dados: AlterarSenhaEntrada, usuario: UsuarioAtual, token: Token, db: DbSessao
) -> None:
    alterar_senha(db, usuario, token, dados.senha_atual, dados.senha_nova)
