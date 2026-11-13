from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import tempo
from app.acesso import Contexto
from app.errors import (
    CONTA_ARQUIVADA,
    LANCAMENTO_JA_CONFIRMADO,
    META_FICARIA_NEGATIVA,
    NAO_ENCONTRADO,
    RESGATE_SUPERA_META,
    AppError,
)
from app.models.conta import Conta
from app.models.lancamento import Lancamento
from app.models.meta import Meta, MetaRendimento
from app.money import para_str
from app.schemas.lancamento import LancamentoEdicaoEntrada
from app.schemas.meta_movimento import (
    MovimentoEntrada,
    RendimentoEdicao,
    RendimentoEntrada,
)
from app.services.lancamentos import invalido, montar_saidas
from app.services.metas import (
    _saida,
    carregar_indicadores,
    travar_meta,
    verificar_invariante,
)


def aplicar(db: Session, ctx: Contexto, meta_id: int, dados: MovimentoEntrada) -> dict:
    return _movimento(db, ctx, meta_id, "aplicacao", dados)


def resgatar(db: Session, ctx: Contexto, meta_id: int, dados: MovimentoEntrada) -> dict:
    return _movimento(db, ctx, meta_id, "resgate", dados)


def atualizar_valor(db: Session, ctx: Contexto, meta_id: int, dados: RendimentoEntrada) -> dict:
    meta = travar_meta(db, ctx, meta_id, gravavel=True)
    diferenca = dados.valor_atual - carregar_indicadores(db, [meta])[meta.id].valor_atual
    rendimento = None
    if diferenca != 0:
        rendimento = MetaRendimento(
            meta_id=meta.id,
            valor=diferenca,
            data=tempo.hoje(),
            criado_por_id=ctx.usuario_id,
        )
        db.add(rendimento)
    verificar_invariante(db, meta.id, META_FICARIA_NEGATIVA)
    db.commit()
    return {
        "rendimento": _rendimento_saida(rendimento) if rendimento is not None else None,
        "meta": _saida(meta, carregar_indicadores(db, [meta])[meta.id], ctx),
    }


def editar_rendimento(
    db: Session, ctx: Contexto, meta_id: int, rendimento_id: int, dados: RendimentoEdicao
) -> dict:
    meta = travar_meta(db, ctx, meta_id, gravavel=True)
    rendimento = _rendimento(db, meta.id, rendimento_id)
    enviados = dados.model_fields_set
    if "data" in enviados:
        tempo.validar_data(dados.data, tempo.hoje())
        rendimento.data = dados.data
    if "valor" in enviados:
        rendimento.valor = dados.valor
    verificar_invariante(db, meta.id, META_FICARIA_NEGATIVA)
    db.commit()
    return _rendimento_saida(rendimento)


def excluir_rendimento(db: Session, ctx: Contexto, meta_id: int, rendimento_id: int) -> None:
    meta = travar_meta(db, ctx, meta_id, gravavel=True)
    db.delete(_rendimento(db, meta.id, rendimento_id))
    verificar_invariante(db, meta.id, META_FICARIA_NEGATIVA)
    db.commit()


def _movimento(db: Session, ctx: Contexto, meta_id: int, tipo: str, dados: MovimentoEntrada) -> dict:
    hoje = tempo.hoje()
    tempo.validar_data(dados.data, hoje)
    meta = travar_meta(db, ctx, meta_id)
    conta = db.scalars(select(Conta).where(Conta.casal_id == meta.casal_id)).one()
    if conta.arquivado:
        raise AppError(409, CONTA_ARQUIVADA, "Conta arquivada.")
    situacao = dados.situacao or ("confirmada" if dados.data <= hoje else "prevista")
    codigo = META_FICARIA_NEGATIVA
    if tipo == "resgate":
        codigo = RESGATE_SUPERA_META
        valor_atual = carregar_indicadores(db, [meta])[meta.id].valor_atual
        if dados.valor > valor_atual:
            raise _erro_resgate(valor_atual)
    lancamento = Lancamento(
        tipo=tipo,
        valor=dados.valor,
        data=dados.data,
        situacao=situacao,
        descricao=dados.descricao,
        conta_id=conta.id,
        meta_id=meta.id,
        criado_por_id=ctx.usuario_id,
    )
    db.add(lancamento)
    verificar_invariante(db, meta.id, codigo)
    db.commit()
    return montar_saidas(db, [lancamento])[0]


_CAMPOS_MOVIMENTO = {"valor", "data", "descricao", "situacao"}


def editar_movimento(
    db: Session, ctx: Contexto, lancamento: Lancamento, entrada: LancamentoEdicaoEntrada
) -> None:
    enviados = entrada.model_fields_set
    extras = sorted(enviados - _CAMPOS_MOVIMENTO)
    if extras:
        raise invalido(extras[0], "Aplicação e resgate só aceitam valor, data, descrição e situação.")
    meta = travar_meta(db, ctx, lancamento.meta_id, gravavel=False)
    atual = _reler_lancamento(db, lancamento.id)
    _conta_arquivada(db, atual)
    if "data" in enviados:
        tempo.validar_data(entrada.data, tempo.hoje())
    # Resgate que continua previsto e tem o valor alterado: comparado com o valor atual (§4.3).
    previsto_depois = entrada.situacao == "prevista" or (
        "situacao" not in enviados and atual.situacao == "prevista"
    )
    valor_muda = "valor" in enviados and entrada.valor != atual.valor
    for campo in enviados:
        setattr(atual, campo, getattr(entrada, campo))
    if atual.tipo == "resgate" and previsto_depois and valor_muda:
        valor_atual = carregar_indicadores(db, [meta])[meta.id].valor_atual
        if atual.valor > valor_atual:
            raise _erro_resgate(valor_atual)
    _verificar_movimento(db, meta, atual)
    db.commit()


def excluir_movimento(db: Session, ctx: Contexto, lancamento: Lancamento) -> None:
    meta = travar_meta(db, ctx, lancamento.meta_id, gravavel=False)
    atual = _reler_lancamento(db, lancamento.id)
    _conta_arquivada(db, atual)
    db.delete(atual)
    verificar_invariante(db, meta.id, META_FICARIA_NEGATIVA)
    db.commit()


def confirmar_movimento(
    db: Session, ctx: Contexto, lancamento: Lancamento, valor: Decimal | None
) -> None:
    meta = travar_meta(db, ctx, lancamento.meta_id, gravavel=False)
    atual = _reler_lancamento(db, lancamento.id)
    if atual.situacao == "confirmada":
        raise AppError(409, LANCAMENTO_JA_CONFIRMADO, "Lançamento já confirmado.")
    _conta_arquivada(db, atual)
    if valor is not None:
        atual.valor = valor
    atual.situacao = "confirmada"
    _verificar_movimento(db, meta, atual)
    db.commit()


def _reler_lancamento(db: Session, lancamento_id: int) -> Lancamento:
    # populate_existing: a leitura anterior à trava da meta pode estar velha.
    atual = db.scalar(
        select(Lancamento)
        .where(Lancamento.id == lancamento_id)
        .execution_options(populate_existing=True)
    )
    if atual is None:
        raise AppError(404, NAO_ENCONTRADO, "Lançamento não encontrado.")
    return atual


def _conta_arquivada(db: Session, lancamento: Lancamento) -> None:
    if db.get(Conta, lancamento.conta_id).arquivado:
        raise AppError(409, CONTA_ARQUIVADA, "Conta arquivada.")


def _verificar_movimento(db: Session, meta: Meta, lancamento: Lancamento) -> None:
    if lancamento.tipo != "resgate":
        verificar_invariante(db, meta.id, META_FICARIA_NEGATIVA)
        return
    db.flush()
    valor_atual = carregar_indicadores(db, [meta])[meta.id].valor_atual
    if valor_atual < 0:
        # Sem este resgate, o valor atual seria o que ele tirou (valor_atual + valor): esse é o teto.
        teto = valor_atual + lancamento.valor
        db.rollback()
        raise _erro_resgate(teto)


def _erro_resgate(valor_atual: Decimal) -> AppError:
    mensagem = (
        f"O resgate não pode ser maior que o valor atual da meta (R$ {para_str(valor_atual)})."
    )
    return AppError(409, RESGATE_SUPERA_META, mensagem, campos={"valor": mensagem})


def _rendimento(db: Session, meta_id: int, rendimento_id: int) -> MetaRendimento:
    rendimento = db.scalar(
        select(MetaRendimento).where(
            MetaRendimento.id == rendimento_id, MetaRendimento.meta_id == meta_id
        )
    )
    if rendimento is None:
        raise AppError(404, NAO_ENCONTRADO, "Rendimento não encontrado.")
    return rendimento


def _rendimento_saida(rendimento: MetaRendimento) -> dict:
    return {
        "id": rendimento.id,
        "meta_id": rendimento.meta_id,
        "data": rendimento.data,
        "valor": para_str(rendimento.valor),
    }
