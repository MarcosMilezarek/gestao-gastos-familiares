from datetime import date
from decimal import Decimal

from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.acesso import Contexto, filtro_contas
from app.errors import (
    COMPRA_COM_ESTORNO,
    ESTORNO_SUPERA_COMPRA,
    FATURA_PAGA,
    NAO_ENCONTRADO,
    AppError,
)
from app.models.cartao import Cartao, Fatura
from app.models.conta import Conta
from app.models.item_fatura import (
    ItemFatura,
    ItemFaturaTag,
    SerieCartao,
    SerieCartaoTag,
)
from app.schemas.item_fatura import ItemEdicaoEntrada
from app.schemas.lancamento import Alcance
from app.services import faturas, recorrencias
from app.services.fatura_calculo import dividir_parcelas
from app.services.itens_base import (
    fatura_paga,
    faturas_pagas,
    gravar_item,
    invalido,
    mes_destino,
    validar_item,
)
from app.tempo import formatar_mes, hoje, mes_ref, somar_meses, validar_mes

_CENTAVO = Decimal("0.01")


def criar_parcelada(db: Session, ctx: Contexto, cartao: Cartao, dados: dict) -> ItemFatura:
    """Gera as N parcelas de uma vez, uma por fatura a partir da inicial. Devolve a primeira. Roda na transação do chamador; não faz commit."""
    n = dados["parcelas"]
    total = dados["valor"]
    if total < _CENTAVO * n:
        raise invalido("parcelas", f"Valor pequeno demais para {n} parcelas.")
    mes_inicial = _mes_inicial(cartao, dados)
    meses = [somar_meses(mes_inicial, k - 1) for k in range(1, n + 1)]
    try:
        validar_mes(formatar_mes(meses[-1]), hoje())
    except AppError as erro:
        raise invalido("parcelas", erro.campos["mes"]) from None
    if _meses_pagos(db, cartao.id, meses):
        raise AppError(409, FATURA_PAGA, "Fatura paga: desfaça o pagamento para alterar.")

    serie = SerieCartao(
        tipo="parcelada",
        cartao_id=cartao.id,
        conta_id=cartao.conta_id,
        descricao=dados["descricao"],
        valor=total,
        categoria_id=dados["categoria_id"],
        observacao=dados.get("observacao"),
        criado_por_id=ctx.usuario_id,
        data_inicial=dados["data"],
        dia=dados["data"].day,
        mes_fatura_inicial=mes_inicial,
        numero_final=n,
        gerado_ate=n,
    )
    db.add(serie)
    db.flush()
    for k, (mes, parcela) in enumerate(zip(meses, dividir_parcelas(total, n)), start=1):
        fatura = faturas.obter_ou_criar(db, cartao, mes)
        item = _item_da_serie(serie, fatura.id, k, dados["data"], parcela)
        db.add(item)
        db.flush()
        db.add_all(
            ItemFaturaTag(item_fatura_id=item.id, tag_id=tag_id)
            for tag_id in dados.get("tag_ids") or ()
        )
    return _primeiro_item(db, serie)


def criar_recorrente(db: Session, ctx: Contexto, cartao: Cartao, dados: dict) -> ItemFatura:
    """Cria a série recorrente e gera a primeira ocorrência. Devolve o item 1. Roda na transação do chamador; não faz commit."""
    mes_inicial = _mes_inicial(cartao, dados)
    recorrencia = dados["recorrencia"]
    serie = SerieCartao(
        tipo="recorrente",
        cartao_id=cartao.id,
        conta_id=cartao.conta_id,
        descricao=dados["descricao"],
        valor=dados["valor"],
        categoria_id=dados["categoria_id"],
        observacao=dados.get("observacao"),
        criado_por_id=ctx.usuario_id,
        data_inicial=dados["data"],
        dia=dados["data"].day,
        mes_fatura_inicial=mes_inicial,
        numero_final=recorrencia["meses"] if recorrencia["modo"] == "n_meses" else None,
        gerado_ate=0,
    )
    db.add(serie)
    db.flush()
    db.add_all(
        SerieCartaoTag(serie_cartao_id=serie.id, tag_id=tag_id)
        for tag_id in dados.get("tag_ids") or ()
    )
    db.flush()
    gerar(db, serie, ate_mes=max(mes_inicial, mes_ref(hoje())))
    return _primeiro_item(db, serie)


def data_do_item(serie: SerieCartao, k: int) -> date:
    return recorrencias.data_ocorrencia(mes_ref(serie.data_inicial), serie.dia, k)


def gerar(db: Session, serie: SerieCartao, ate_mes: date) -> None:
    alvo = _alvo(serie, ate_mes)
    if alvo <= serie.gerado_ate:
        return
    cartao = db.get(Cartao, serie.cartao_id)
    tag_ids = db.scalars(
        select(SerieCartaoTag.tag_id).where(SerieCartaoTag.serie_cartao_id == serie.id)
    ).all()
    meses = {k: somar_meses(serie.mes_fatura_inicial, k - 1) for k in range(serie.gerado_ate + 1, alvo + 1)}
    pagas = _meses_pagos(db, cartao.id, meses.values())
    for k, mes in meses.items():
        # Fatura já paga não recebe item novo; o contador avança mesmo assim.
        if mes in pagas:
            continue
        fatura = faturas.obter_ou_criar(db, cartao, mes)
        item = _item_da_serie(serie, fatura.id, k, data_do_item(serie, k), serie.valor)
        try:
            with db.begin_nested():
                db.add(item)
                db.flush()
        except IntegrityError as erro:
            if "uq_item_fatura_serie_id_numero_serie" not in str(erro.orig):
                raise
            continue
        db.add_all(ItemFaturaTag(item_fatura_id=item.id, tag_id=tag_id) for tag_id in tag_ids)
    serie.gerado_ate = alvo


def garantir_ate(db: Session, ctx: Contexto, ate: date) -> None:
    contas = select(Conta.id).where(filtro_contas(ctx), Conta.arquivado == 0)
    candidatas = db.scalars(
        select(SerieCartao)
        .where(
            SerieCartao.tipo == "recorrente",
            SerieCartao.conta_id.in_(contas),
            or_(
                SerieCartao.numero_final.is_(None),
                SerieCartao.gerado_ate < SerieCartao.numero_final,
            ),
        )
        .order_by(SerieCartao.cartao_id, SerieCartao.id)
    ).all()
    mes = mes_ref(ate)
    gerou = False
    for serie in candidatas:
        if _alvo(serie, mes) <= serie.gerado_ate:
            continue
        # Ordem conta -> cartão -> série (D-046): o cartão é travado antes da série.
        faturas.travar_cartao(db, ctx, serie.cartao_id, conta_ativa=False)
        travada = db.scalar(
            select(SerieCartao)
            .where(SerieCartao.id == serie.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        # Reconfere com a série travada: outra sessão pode ter gerado, arquivado a conta ou excluído a série.
        if (
            travada is None
            or _alvo(travada, mes) <= travada.gerado_ate
            or db.get(Conta, travada.conta_id).arquivado
        ):
            continue
        antes = travada.gerado_ate
        gerar(db, travada, mes)
        gerou = gerou or travada.gerado_ate > antes
    if gerou:
        db.commit()


def _mes_inicial(cartao: Cartao, dados: dict) -> date:
    return mes_destino(cartao, dados, hoje())


def _meses_pagos(db: Session, cartao_id: int, meses) -> set[date]:
    linhas = db.execute(
        select(Fatura.id, Fatura.mes_ref).where(
            Fatura.cartao_id == cartao_id, Fatura.mes_ref.in_(list(meses))
        )
    ).all()
    if not linhas:
        return set()
    pagas = faturas_pagas(db, [id_ for id_, _ in linhas])
    return {mes for id_, mes in linhas if id_ in pagas}


def _alvo(serie: SerieCartao, ate_mes: date) -> int:
    k = (
        (ate_mes.year - serie.mes_fatura_inicial.year) * 12
        + ate_mes.month
        - serie.mes_fatura_inicial.month
        + 1
    )
    if serie.numero_final is not None:
        k = min(k, serie.numero_final)
    return k


def _item_da_serie(
    serie: SerieCartao, fatura_id: int, numero: int, data: date, valor: Decimal
) -> ItemFatura:
    return ItemFatura(
        fatura_id=fatura_id,
        conta_id=serie.conta_id,
        tipo="compra",
        valor=valor,
        data=data,
        descricao=serie.descricao,
        categoria_id=serie.categoria_id,
        observacao=serie.observacao,
        serie_id=serie.id,
        numero_serie=numero,
        criado_por_id=serie.criado_por_id,
    )


def _primeiro_item(db: Session, serie: SerieCartao) -> ItemFatura:
    return db.scalar(
        select(ItemFatura).where(ItemFatura.serie_id == serie.id, ItemFatura.numero_serie == 1)
    )


def editar(
    db: Session, ctx: Contexto, item: ItemFatura, dados: ItemEdicaoEntrada, alcance: Alcance
) -> ItemFatura:
    """Edita o item de série e, conforme o alcance, o conjunto e o modelo; uma transação (§4.5, D-045)."""
    enviados = dados.model_fields_set
    cartao = faturas.travar_cartao(db, ctx, _cartao_da_serie(db, item.serie_id))
    serie = _travar_serie(db, item.serie_id)
    _conferir_alcance(serie, enviados, alcance)
    _exigir_fatura_aberta(db, item, alcance)
    if (
        "data" in enviados
        and alcance != "somente_este"
        and mes_ref(dados.data) != mes_ref(data_do_item(serie, item.numero_serie))
    ):
        raise invalido("data", "A data deve ficar no mês da ocorrência.")

    conjunto = _conjunto(db, item, serie, alcance)
    if "valor" in enviados:
        _conferir_estornos(db, [atual.id for atual, _ in conjunto], dados.valor)
    tags_atuais = _tags_dos_itens(db, [atual.id for atual, _ in conjunto])
    planos = []
    for atual, fatura in conjunto:
        if "data" not in enviados:
            data = atual.data
        elif alcance == "somente_este":
            data = dados.data
        else:
            data = recorrencias.data_ocorrencia(
                mes_ref(serie.data_inicial), dados.data.day, atual.numero_serie
            )
        estado = {
            "valor": dados.valor if "valor" in enviados else atual.valor,
            "data": data,
            "descricao": dados.descricao if "descricao" in enviados else atual.descricao,
            "categoria_id": dados.categoria_id if "categoria_id" in enviados else atual.categoria_id,
            "observacao": dados.observacao if "observacao" in enviados else atual.observacao,
            "tag_ids": dados.tag_ids if "tag_ids" in enviados else tags_atuais.get(atual.id, []),
        }
        # Só o somente_este move a fatura; nos demais o item fica na fatura que já tem.
        muda_fatura = alcance == "somente_este" and "fatura_mes" in enviados
        if muda_fatura:
            estado["fatura_mes"] = dados.fatura_mes
        mes = validar_item(
            db,
            ctx,
            cartao,
            estado,
            "compra",
            atual=atual,
            mes=None if muda_fatura else fatura.mes_ref,
            ignorar_fatura_paga=alcance == "todos",
        )
        planos.append((atual, mes, estado))

    for atual, mes, estado in planos:
        gravar_item(db, ctx, cartao, mes, estado, "compra", atual=atual)
    if alcance != "somente_este":
        _gravar_modelo(db, serie, dados, enviados)
    faturas.sincronizar_pagamentos(db, cartao.id)
    db.commit()
    return item


def excluir(db: Session, ctx: Contexto, item: ItemFatura, alcance: Alcance) -> None:
    """Exclui o item de série e, conforme o alcance, o conjunto e a série; uma transação (§4.5)."""
    cartao = faturas.travar_cartao(db, ctx, _cartao_da_serie(db, item.serie_id))
    serie = _travar_serie(db, item.serie_id)
    n = item.numero_serie
    _exigir_fatura_aberta(db, item, alcance)
    conjunto = _conjunto(db, item, serie, alcance)
    ids = [atual.id for atual, _ in conjunto]
    if db.scalar(select(ItemFatura.id).where(ItemFatura.item_origem_id.in_(ids)).limit(1)):
        raise AppError(409, COMPRA_COM_ESTORNO, "Compra com estorno vinculado.")

    db.execute(delete(ItemFaturaTag).where(ItemFaturaTag.item_fatura_id.in_(ids)))
    db.execute(delete(ItemFatura).where(ItemFatura.id.in_(ids)))
    if alcance == "todos":
        db.execute(delete(SerieCartaoTag).where(SerieCartaoTag.serie_cartao_id == serie.id))
        db.execute(delete(SerieCartao).where(SerieCartao.id == serie.id))
    elif alcance == "este_e_pendentes" and serie.tipo == "recorrente":
        serie.numero_final = n - 1
    faturas.sincronizar_pagamentos(db, cartao.id)
    db.commit()


def _cartao_da_serie(db: Session, serie_id: int) -> int:
    # Leitura sem trava: só descobre o cartão, que é travado antes da série (D-046).
    cartao_id = db.scalar(select(SerieCartao.cartao_id).where(SerieCartao.id == serie_id))
    if cartao_id is None:
        raise AppError(404, NAO_ENCONTRADO, "Item não encontrado.")
    return cartao_id


def _travar_serie(db: Session, serie_id: int) -> SerieCartao:
    # Trava a série antes de ler o conjunto: edição e exclusão não correm uma sobre a outra.
    serie = db.scalar(
        select(SerieCartao)
        .where(SerieCartao.id == serie_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if serie is None:
        raise AppError(404, NAO_ENCONTRADO, "Item não encontrado.")
    return serie


def _exigir_fatura_aberta(db: Session, item: ItemFatura, alcance: Alcance) -> None:
    # Nos alcances que tocam o item escolhido, a fatura de origem não pode estar paga (RF-4.19).
    if alcance != "todos" and fatura_paga(db, item.fatura_id):
        raise AppError(409, FATURA_PAGA, "Fatura paga: desfaça o pagamento para alterar.")


def _conferir_estornos(db: Session, ids: list[int], valor: Decimal) -> None:
    # O valor enviado vale para todo o conjunto; a soma dos estornos vinculados não pode passar dele (D8).
    somas = db.execute(
        select(ItemFatura.item_origem_id, func.sum(ItemFatura.valor))
        .where(ItemFatura.item_origem_id.in_(ids), ItemFatura.tipo == "estorno")
        .group_by(ItemFatura.item_origem_id)
    ).all()
    if any(valor < soma for _, soma in somas):
        raise AppError(409, ESTORNO_SUPERA_COMPRA, "Estornos vinculados superam o valor da compra.")


def _conferir_alcance(serie: SerieCartao, enviados: set[str], alcance: Alcance) -> None:
    # Parcelada: valor, fatura_mes e data só em somente_este. Recorrente: fatura_mes só em somente_este.
    if serie.tipo == "parcelada" and alcance != "somente_este":
        proibidos = {"valor", "fatura_mes", "data"}
    elif serie.tipo == "recorrente" and alcance != "somente_este":
        proibidos = {"fatura_mes"}
    else:
        proibidos = set()
    if enviados & proibidos:
        raise invalido("alcance", "Este campo só muda com o alcance somente_este.")


def _conjunto(
    db: Session, item: ItemFatura, serie: SerieCartao, alcance: Alcance
) -> list[tuple[ItemFatura, Fatura]]:
    """Itens atingidos pelo alcance, com a fatura de cada um. Lidos depois da trava da série."""
    linhas = db.execute(
        select(ItemFatura, Fatura)
        .join(Fatura, Fatura.id == ItemFatura.fatura_id)
        .where(ItemFatura.serie_id == serie.id)
        .order_by(ItemFatura.numero_serie)
        .execution_options(populate_existing=True)
    ).all()
    if alcance == "todos":
        conjunto = linhas
    elif alcance == "somente_este":
        conjunto = [(i, f) for i, f in linhas if i.id == item.id]
    else:
        pagas = faturas_pagas(db, [f.id for _, f in linhas])
        conjunto = [
            (i, f)
            for i, f in linhas
            if i.numero_serie == item.numero_serie
            or (i.numero_serie > item.numero_serie and f.id not in pagas)
        ]
    if not any(i.id == item.id for i, _ in conjunto):
        raise AppError(404, NAO_ENCONTRADO, "Item não encontrado.")
    return conjunto


def _tags_dos_itens(db: Session, ids: list[int]) -> dict[int, list[int]]:
    tags: dict[int, list[int]] = {}
    for item_id, tag_id in db.execute(
        select(ItemFaturaTag.item_fatura_id, ItemFaturaTag.tag_id).where(
            ItemFaturaTag.item_fatura_id.in_(ids)
        )
    ):
        tags.setdefault(item_id, []).append(tag_id)
    return tags


def _gravar_modelo(
    db: Session, serie: SerieCartao, dados: ItemEdicaoEntrada, enviados: set[str]
) -> None:
    # Modelo da série: vale para as ocorrências ainda não geradas (só em este_e_pendentes e todos).
    for campo in ("descricao", "categoria_id", "observacao"):
        if campo in enviados:
            setattr(serie, campo, getattr(dados, campo))
    if "valor" in enviados:
        serie.valor = dados.valor
    if "data" in enviados:
        serie.dia = dados.data.day
    if "tag_ids" in enviados:
        db.execute(delete(SerieCartaoTag).where(SerieCartaoTag.serie_cartao_id == serie.id))
        db.add_all(SerieCartaoTag(serie_cartao_id=serie.id, tag_id=tag_id) for tag_id in dados.tag_ids)
