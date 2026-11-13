from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.acesso import Contexto, _de_escopo_visivel, dono_da_lista, tag_visivel
from app.errors import TAG_JA_EXISTE, AppError
from app.models.categoria import Tag
from app.services.alvos_vinculo import ALVOS_TAG

_MSG_JA_EXISTE = "Já existe uma tag com este nome."


def listar(db: Session, ctx: Contexto) -> list[dict]:
    tags = db.scalars(select(Tag).where(_de_escopo_visivel(Tag, ctx)).order_by(Tag.nome)).all()
    return [_saida(tag) for tag in tags]


def criar(db: Session, ctx: Contexto, nome: str) -> dict:
    coluna, valor = dono_da_lista(ctx)
    tag = Tag(**{coluna: valor}, nome=nome)
    db.add(tag)
    _gravar(db)
    return _saida(tag)


def renomear(db: Session, ctx: Contexto, tag_id: int, nome: str) -> dict:
    tag = tag_visivel(db, ctx, tag_id)
    tag.nome = nome
    _gravar(db)
    return _saida(tag)


def excluir(db: Session, ctx: Contexto, tag_id: int) -> None:
    tag = tag_visivel(db, ctx, tag_id)
    for alvo in ALVOS_TAG:
        db.execute(delete(alvo.modelo).where(alvo.coluna == tag.id))
    db.delete(tag)
    db.commit()


def _gravar(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as erro:
        db.rollback()
        if "uq_tag_escopo_nome" not in str(erro.orig):
            raise
        raise AppError(409, TAG_JA_EXISTE, _MSG_JA_EXISTE, campos={"nome": _MSG_JA_EXISTE}) from erro


def _saida(tag: Tag) -> dict:
    return {"id": tag.id, "nome": tag.nome}
