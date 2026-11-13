from dataclasses import dataclass
from datetime import date

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.errors import (
    CASAL_ENCERRADO,
    LANCAMENTO_SOMENTE_LEITURA,
    NAO_ENCONTRADO,
    AppError,
)
from app.models.cartao import Cartao
from app.models.casal import Casal
from app.models.categoria import Categoria, Tag
from app.models.conta import Conta
from app.models.item_fatura import ItemFatura
from app.models.lancamento import Lancamento
from app.models.meta import Meta
from app.models.planejamento import Cenario, Orcamento


@dataclass(frozen=True)
class Contexto:
    usuario_id: int
    casal_ativo_id: int | None
    parceiro_id: int | None
    casais_ids: frozenset[int]


def contexto_do_usuario(db: Session, usuario_id: int) -> Contexto:
    casais = db.scalars(
        select(Casal).where(
            or_(Casal.pessoa_a_id == usuario_id, Casal.pessoa_b_id == usuario_id)
        )
    ).all()
    ativo = next((c for c in casais if c.encerrado_em is None), None)
    parceiro_id = None
    if ativo is not None:
        parceiro_id = ativo.pessoa_b_id if ativo.pessoa_a_id == usuario_id else ativo.pessoa_a_id
    return Contexto(
        usuario_id=usuario_id,
        casal_ativo_id=ativo.id if ativo is not None else None,
        parceiro_id=parceiro_id,
        casais_ids=frozenset(c.id for c in casais),
    )


def filtro_contas(ctx: Contexto):
    pessoas = [p for p in (ctx.usuario_id, ctx.parceiro_id) if p is not None]
    return or_(
        Conta.usuario_id.in_(pessoas),
        Conta.casal_id.in_(sorted(ctx.casais_ids)),
    )


def filtro_lancamentos(ctx: Contexto):
    contas_visiveis = select(Conta.id).where(filtro_contas(ctx))
    return or_(
        Lancamento.conta_id.in_(contas_visiveis),
        Lancamento.conta_destino_id.in_(contas_visiveis),
    )


def _de_escopo_visivel(modelo, ctx: Contexto):
    condicoes = [modelo.usuario_id == ctx.usuario_id]
    if ctx.casal_ativo_id is not None:
        condicoes.append(modelo.casal_id == ctx.casal_ativo_id)
    return or_(*condicoes)


def dono_da_lista(ctx: Contexto) -> tuple[str, int]:
    if ctx.casal_ativo_id is not None:
        return ("casal_id", ctx.casal_ativo_id)
    return ("usuario_id", ctx.usuario_id)


def conta_visivel(db: Session, ctx: Contexto, conta_id: int) -> Conta:
    conta = db.scalar(select(Conta).where(Conta.id == conta_id, filtro_contas(ctx)))
    if conta is None:
        raise AppError(404, NAO_ENCONTRADO, "Conta não encontrada.")
    return conta


def cartao_visivel(db: Session, ctx: Contexto, cartao_id: int) -> Cartao:
    cartao = db.scalar(
        select(Cartao)
        .join(Conta, Conta.id == Cartao.conta_id)
        .where(Cartao.id == cartao_id, filtro_contas(ctx))
    )
    if cartao is None:
        raise AppError(404, NAO_ENCONTRADO, "Cartão não encontrado.")
    return cartao


def item_fatura_visivel(db: Session, ctx: Contexto, item_id: int) -> ItemFatura:
    item = db.scalar(
        select(ItemFatura)
        .join(Conta, Conta.id == ItemFatura.conta_id)
        .where(ItemFatura.id == item_id, filtro_contas(ctx))
    )
    if item is None:
        raise AppError(404, NAO_ENCONTRADO, "Item da fatura não encontrado.")
    return item


def lancamento_visivel(db: Session, ctx: Contexto, lancamento_id: int) -> Lancamento:
    lancamento = db.scalar(
        select(Lancamento).where(Lancamento.id == lancamento_id, filtro_lancamentos(ctx))
    )
    if lancamento is None:
        raise AppError(404, NAO_ENCONTRADO, "Lançamento não encontrado.")
    return lancamento


def lancamento_gravavel(db: Session, ctx: Contexto, lancamento_id: int) -> Lancamento:
    lancamento = lancamento_visivel(db, ctx, lancamento_id)
    pontas = {lancamento.conta_id, lancamento.conta_destino_id} - {None}
    visiveis = set(
        db.scalars(select(Conta.id).where(Conta.id.in_(pontas), filtro_contas(ctx))).all()
    )
    if visiveis != pontas:
        raise AppError(
            409,
            LANCAMENTO_SOMENTE_LEITURA,
            "Lançamento somente leitura: uma das contas não é sua.",
        )
    return lancamento


def meta_visivel(db: Session, ctx: Contexto, meta_id: int) -> Meta:
    meta = db.scalar(
        select(Meta).where(Meta.id == meta_id, Meta.casal_id.in_(sorted(ctx.casais_ids)))
    )
    if meta is None:
        raise AppError(404, NAO_ENCONTRADO, "Meta não encontrada.")
    return meta


def meta_gravavel(db: Session, ctx: Contexto, meta_id: int) -> Meta:
    meta = meta_visivel(db, ctx, meta_id)
    if meta.casal_id != ctx.casal_ativo_id:
        raise AppError(409, CASAL_ENCERRADO, "O casal foi desfeito; este item só pode ser consultado.")
    return meta


def orcamento_do_mes(db: Session, ctx: Contexto, mes: date) -> Orcamento | None:
    if ctx.casal_ativo_id is None:
        return None
    return db.scalar(
        select(Orcamento).where(
            Orcamento.casal_id == ctx.casal_ativo_id, Orcamento.mes_ref == mes
        )
    )


def cenario_visivel(db: Session, ctx: Contexto, cenario_id: int) -> Cenario:
    cenario = db.scalar(
        select(Cenario).where(Cenario.id == cenario_id, Cenario.casal_id.in_(sorted(ctx.casais_ids)))
    )
    if cenario is None:
        raise AppError(404, NAO_ENCONTRADO, "Cenário não encontrado.")
    return cenario


def cenario_gravavel(db: Session, ctx: Contexto, cenario_id: int) -> Cenario:
    cenario = cenario_visivel(db, ctx, cenario_id)
    if cenario.casal_id != ctx.casal_ativo_id:
        raise AppError(409, CASAL_ENCERRADO, "O casal foi desfeito; este item só pode ser consultado.")
    return cenario


def categorias_visiveis(db: Session, ctx: Contexto, ids: list[int]) -> dict[int, Categoria]:
    if not ids:
        return {}
    categorias = db.scalars(
        select(Categoria).where(Categoria.id.in_(ids), _de_escopo_visivel(Categoria, ctx))
    ).all()
    return {c.id: c for c in categorias}


def categoria_visivel(db: Session, ctx: Contexto, categoria_id: int) -> Categoria:
    categoria = db.scalar(
        select(Categoria).where(Categoria.id == categoria_id, _de_escopo_visivel(Categoria, ctx))
    )
    if categoria is None:
        raise AppError(404, NAO_ENCONTRADO, "Categoria não encontrada.")
    return categoria


def tag_visivel(db: Session, ctx: Contexto, tag_id: int) -> Tag:
    tag = db.scalar(select(Tag).where(Tag.id == tag_id, _de_escopo_visivel(Tag, ctx)))
    if tag is None:
        raise AppError(404, NAO_ENCONTRADO, "Tag não encontrada.")
    return tag
