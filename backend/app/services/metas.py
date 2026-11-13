from decimal import Decimal

from sqlalchemy import exists, func, select
from sqlalchemy.orm import Session

from app import tempo
from app.acesso import Contexto, meta_gravavel, meta_visivel
from app.errors import (
    META_COM_MOVIMENTOS,
    META_FICARIA_NEGATIVA,
    NAO_ENCONTRADO,
    RESGATE_SUPERA_META,
    SEM_VINCULO,
    AppError,
)
from app.models.lancamento import Lancamento
from app.models.meta import Meta, MetaRendimento
from app.money import para_str
from app.schemas.meta import MetaEdicao, MetaEntrada
from app.services.metas_calculo import Indicadores, indicadores
from app.services.saldos import situacao_exibida

_ZERO = Decimal(0)
_MENSAGENS = {
    META_FICARIA_NEGATIVA: (
        "Isso deixaria o valor da meta negativo: um resgate passaria a superar o valor atual."
    ),
    RESGATE_SUPERA_META: "O resgate não pode ser maior que o valor atual da meta.",
}


def carregar_indicadores(db: Session, metas: list[Meta]) -> dict[int, Indicadores]:
    if not metas:
        return {}
    ids = [meta.id for meta in metas]
    aplicacoes = {meta_id: _ZERO for meta_id in ids}
    resgates = {meta_id: _ZERO for meta_id in ids}
    rendimentos = {meta_id: _ZERO for meta_id in ids}
    movimentos = db.execute(
        select(Lancamento.meta_id, Lancamento.tipo, func.sum(Lancamento.valor))
        .where(Lancamento.meta_id.in_(ids), Lancamento.situacao == "confirmada")
        .group_by(Lancamento.meta_id, Lancamento.tipo)
    ).all()
    for meta_id, tipo, total in movimentos:
        if tipo == "aplicacao":
            aplicacoes[meta_id] = Decimal(total)
        elif tipo == "resgate":
            resgates[meta_id] = Decimal(total)
    # Rendimento não tem situação nem data: conta na hora (RF-6.06).
    for meta_id, total in db.execute(
        select(MetaRendimento.meta_id, func.sum(MetaRendimento.valor))
        .where(MetaRendimento.meta_id.in_(ids))
        .group_by(MetaRendimento.meta_id)
    ).all():
        rendimentos[meta_id] = Decimal(total)
    return {
        meta.id: indicadores(
            meta.valor_alvo,
            meta.valor_inicial,
            aplicacoes[meta.id],
            resgates[meta.id],
            rendimentos[meta.id],
        )
        for meta in metas
    }


def travar_meta(db: Session, ctx: Contexto, meta_id: int, gravavel: bool = False) -> Meta:
    if gravavel:
        meta_gravavel(db, ctx, meta_id)
    else:
        meta_visivel(db, ctx, meta_id)
    meta = db.scalar(
        select(Meta)
        .where(Meta.id == meta_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if meta is None:
        # Excluída entre a checagem de acesso e a trava.
        raise AppError(404, NAO_ENCONTRADO, "Meta não encontrada.")
    return meta


def verificar_invariante(db: Session, meta_id: int, codigo: str) -> None:
    db.flush()
    meta = db.get(Meta, meta_id)
    if carregar_indicadores(db, [meta])[meta_id].valor_atual < 0:
        db.rollback()
        raise AppError(409, codigo, _MENSAGENS[codigo])


def listar(db: Session, ctx: Contexto) -> dict:
    metas = db.scalars(
        select(Meta).where(Meta.casal_id.in_(sorted(ctx.casais_ids))).order_by(Meta.id)
    ).all()
    indicadores_por_meta = carregar_indicadores(db, metas)
    patrimonio = sum(
        (
            indicadores_por_meta[meta.id].valor_atual
            for meta in metas
            if meta.casal_id == ctx.casal_ativo_id
        ),
        _ZERO,
    )
    return {
        "patrimonio_total": para_str(patrimonio),
        "metas": [_saida(meta, indicadores_por_meta[meta.id], ctx) for meta in metas],
    }


def detalhe(db: Session, ctx: Contexto, meta_id: int) -> dict:
    meta = meta_visivel(db, ctx, meta_id)
    indicador = carregar_indicadores(db, [meta])[meta.id]
    return {
        **_saida(meta, indicador, ctx),
        "movimentos": _movimentos(db, meta),
    }


def criar(db: Session, ctx: Contexto, dados: MetaEntrada) -> dict:
    if ctx.casal_ativo_id is None:
        raise AppError(409, SEM_VINCULO, "Você não está vinculado a um casal.")
    meta = Meta(
        casal_id=ctx.casal_ativo_id,
        nome=dados.nome,
        valor_alvo=dados.valor_alvo,
        data_alvo=dados.data_alvo,
        valor_inicial=dados.valor_inicial,
        cor=dados.cor,
        icone=dados.icone,
        descricao=dados.descricao,
    )
    db.add(meta)
    db.commit()
    return _saida(meta, carregar_indicadores(db, [meta])[meta.id], ctx)


def editar(db: Session, ctx: Contexto, meta_id: int, dados: MetaEdicao) -> dict:
    meta = travar_meta(db, ctx, meta_id, gravavel=True)
    enviados = dados.model_dump(exclude_unset=True)
    for campo, valor in enviados.items():
        setattr(meta, campo, valor)
    if "valor_inicial" in enviados:
        verificar_invariante(db, meta.id, META_FICARIA_NEGATIVA)
    db.commit()
    return _saida(meta, carregar_indicadores(db, [meta])[meta.id], ctx)


def excluir(db: Session, ctx: Contexto, meta_id: int) -> None:
    meta = travar_meta(db, ctx, meta_id, gravavel=True)
    tem_movimento = db.scalar(select(exists().where(Lancamento.meta_id == meta.id))) or db.scalar(
        select(exists().where(MetaRendimento.meta_id == meta.id))
    )
    if tem_movimento:
        raise AppError(
            409,
            META_COM_MOVIMENTOS,
            "A meta tem aplicações, resgates ou rendimentos: não pode ser excluída.",
        )
    db.delete(meta)
    db.commit()


def _saida(meta: Meta, indicador: Indicadores, ctx: Contexto) -> dict:
    return {
        "id": meta.id,
        "nome": meta.nome,
        "valor_alvo": para_str(meta.valor_alvo),
        "data_alvo": meta.data_alvo,
        "valor_inicial": para_str(meta.valor_inicial),
        "cor": meta.cor,
        "icone": meta.icone,
        "descricao": meta.descricao,
        "valor_atual": para_str(indicador.valor_atual),
        "aplicado_liquido": para_str(indicador.aplicado_liquido),
        "rendeu": para_str(indicador.rendeu),
        "falta": para_str(indicador.falta),
        "porcentagem": para_str(indicador.porcentagem),
        "situacao": indicador.situacao,
        # Casal não ativo = casal desfeito (mesma regra de acesso.meta_gravavel).
        "casal_encerrado": meta.casal_id != ctx.casal_ativo_id,
    }


def _movimentos(db: Session, meta: Meta) -> list[dict]:
    hoje = tempo.hoje()
    lancamentos = db.scalars(select(Lancamento).where(Lancamento.meta_id == meta.id)).all()
    rendimentos = db.scalars(
        select(MetaRendimento).where(MetaRendimento.meta_id == meta.id)
    ).all()
    movimentos = [
        {
            "tipo": lancamento.tipo,
            "id": lancamento.id,
            "data": lancamento.data,
            "valor": para_str(-lancamento.valor if lancamento.tipo == "resgate" else lancamento.valor),
            "situacao": situacao_exibida(lancamento.situacao, lancamento.data, hoje),
            "descricao": lancamento.descricao,
        }
        for lancamento in lancamentos
    ]
    movimentos += [
        {
            "tipo": "rendimento",
            "id": rendimento.id,
            "data": rendimento.data,
            "valor": para_str(rendimento.valor),
            "situacao": None,
            "descricao": None,
        }
        for rendimento in rendimentos
    ]
    if meta.valor_inicial != 0:
        movimentos.append(
            {
                "tipo": "inicial",
                "id": None,
                "data": tempo.para_data_local(meta.criado_em),
                "valor": para_str(meta.valor_inicial),
                "situacao": None,
                "descricao": None,
            }
        )
    # Data desc, id desc; o inicial (id nulo) fica por último na sua data.
    movimentos.sort(key=lambda m: (m["data"], m["id"] or 0), reverse=True)
    return movimentos
