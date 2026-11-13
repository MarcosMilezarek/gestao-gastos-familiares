from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.acesso import Contexto
from app.config import get_settings
from app.errors import (
    CREDENCIAIS_INVALIDAS,
    EMAIL_JA_CADASTRADO,
    SENHA_ATUAL_INCORRETA,
    VALIDACAO,
    AppError,
)
from app.models.usuario import Sessao, Usuario
from app.schemas.sessao import SENHA_MAXIMA, CadastroEntrada
from app.security import (
    HASH_FALSO,
    check_needs_rehash,
    hash_senha,
    hash_token,
    novo_token,
    verificar_senha,
)
from app.services import ganchos
from app.tempo import agora_utc, hoje

_MSG_EMAIL_JA_CADASTRADO = "Este e-mail já está cadastrado."
_MSG_CREDENCIAIS = "E-mail ou senha incorretos."
_MSG_SENHA_ATUAL = "A senha atual não confere."


def _erro_email_ja_cadastrado() -> AppError:
    return AppError(
        409,
        EMAIL_JA_CADASTRADO,
        _MSG_EMAIL_JA_CADASTRADO,
        campos={"email": _MSG_EMAIL_JA_CADASTRADO},
    )


def _erro_credenciais() -> AppError:
    return AppError(401, CREDENCIAIS_INVALIDAS, _MSG_CREDENCIAIS)


def _nova_sessao(db: Session, usuario: Usuario) -> str:
    token, token_hash = novo_token()
    agora = agora_utc()
    db.add(
        Sessao(
            usuario_id=usuario.id,
            token_hash=token_hash,
            criado_em=agora,
            expira_em=agora + timedelta(days=get_settings().SESSAO_DIAS),
            ultimo_uso_em=agora,
        )
    )
    return token


def cadastrar(db: Session, dados: CadastroEntrada) -> tuple[Usuario, str]:
    if dados.senha != dados.senha_confirmacao:
        mensagem = "As senhas não conferem."
        raise AppError(
            422, VALIDACAO, mensagem, campos={"senha_confirmacao": mensagem}
        )
    if db.scalar(select(Usuario.id).where(Usuario.email == dados.email)) is not None:
        raise _erro_email_ja_cadastrado()
    usuario = Usuario(
        nome=dados.nome,
        email=dados.email,
        senha_hash=hash_senha(dados.senha),
        tema="claro",
    )
    db.add(usuario)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise _erro_email_ja_cadastrado() from None
    ganchos.ao_cadastrar(db, usuario)
    token = _nova_sessao(db, usuario)
    db.commit()
    return usuario, token


def entrar(db: Session, email: str, senha: str) -> tuple[Usuario, str]:
    if len(senha) > SENHA_MAXIMA:
        raise _erro_credenciais()
    usuario = db.scalar(select(Usuario).where(Usuario.email == email))
    if usuario is None:
        verificar_senha(senha, HASH_FALSO)
        raise _erro_credenciais()
    if not verificar_senha(senha, usuario.senha_hash):
        raise _erro_credenciais()
    if check_needs_rehash(usuario.senha_hash):
        usuario.senha_hash = hash_senha(senha)
    db.execute(
        delete(Sessao).where(
            Sessao.usuario_id == usuario.id, Sessao.expira_em <= agora_utc()
        )
    )
    token = _nova_sessao(db, usuario)
    db.commit()
    return usuario, token


def resolver_sessao(db: Session, token: str) -> Usuario | None:
    sessao = db.scalar(select(Sessao).where(Sessao.token_hash == hash_token(token)))
    if sessao is None:
        return None
    agora = agora_utc()
    if sessao.expira_em <= agora:
        db.delete(sessao)
        db.commit()
        return None
    if agora - sessao.ultimo_uso_em > timedelta(hours=1):
        sessao.ultimo_uso_em = agora
        db.commit()
    return db.get(Usuario, sessao.usuario_id)


def sair(db: Session, token: str) -> None:
    db.execute(delete(Sessao).where(Sessao.token_hash == hash_token(token)))
    db.commit()


def atualizar_perfil(
    db: Session, usuario: Usuario, nome: str | None = None, tema: str | None = None
) -> Usuario:
    if nome is not None:
        usuario.nome = nome
    if tema is not None:
        usuario.tema = tema
    db.commit()
    return usuario


def alterar_senha(
    db: Session,
    usuario: Usuario,
    token_atual: str,
    senha_atual: str,
    senha_nova: str,
) -> None:
    if len(senha_atual) > SENHA_MAXIMA or not verificar_senha(
        senha_atual, usuario.senha_hash
    ):
        raise AppError(
            409, SENHA_ATUAL_INCORRETA, _MSG_SENHA_ATUAL, campos={"senha_atual": _MSG_SENHA_ATUAL}
        )
    usuario.senha_hash = hash_senha(senha_nova)
    db.execute(
        delete(Sessao).where(
            Sessao.usuario_id == usuario.id,
            Sessao.token_hash != hash_token(token_atual),
        )
    )
    db.commit()


def montar_sessao(db: Session, usuario: Usuario, ctx: Contexto) -> dict:
    casal = None
    if ctx.casal_ativo_id is not None:
        parceiro = db.get(Usuario, ctx.parceiro_id)
        casal = {
            "id": ctx.casal_ativo_id,
            "parceiro": {"id": parceiro.id, "nome": parceiro.nome},
        }
    return {
        "usuario": {
            "id": usuario.id,
            "nome": usuario.nome,
            "email": usuario.email,
            "tema": usuario.tema,
        },
        "hoje": hoje(),
        "casal": casal,
    }
