from datetime import date
from decimal import Decimal

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.acesso import Contexto, cartao_visivel, item_fatura_visivel
from app.errors import (
    COMPRA_COM_ESTORNO,
    ESTORNO_SUPERA_COMPRA,
    FATURA_PAGA,
    ITEM_NAO_EDITAVEL,
    VALIDACAO,
    AppError,
)
from app.models.cartao import Cartao, Fatura
from app.models.conta import Conta
from app.models.item_fatura import ItemFatura, ItemFaturaTag
from app.money import para_str
from app.schemas.item_fatura import (
    AjusteSaida,
    FaturaSaida,
    ItemEdicaoEntrada,
    ItemFaturaSaida,
)
from app.schemas.lancamento import Alcance
from app.services import faturas, ganchos, series_cartao
from app.services.cartoes import resumo_fatura
from app.services.fatura_calculo import mes_da_fatura
from app.services.itens_base import (
    carregar_referencias,
    fatura_paga,
    gravar_item,
    invalido,
    saida_item,
    validar_item,
)
from app.tempo import (
    fim_do_mes,
    formatar_mes,
    hoje,
    mes_ref,
    somar_meses,
    validar_data,
    validar_mes,
)


def criar_compra(db: Session, ctx: Contexto, cartao_id: int, dados: dict) -> ItemFaturaSaida:
    cartao = faturas.travar_cartao(db, ctx, cartao_id)
    mes = validar_item(db, ctx, cartao, dados, "compra")
    if dados.get("parcelas") is not None:
        item = series_cartao.criar_parcelada(db, ctx, cartao, dados)
    elif dados.get("recorrencia") is not None:
        item = series_cartao.criar_recorrente(db, ctx, cartao, dados)
    else:
        item = gravar_item(db, ctx, cartao, mes, dados, "compra")
    faturas.sincronizar_pagamentos(db, cartao.id)
    db.commit()
    return saida_item(item, carregar_referencias(db, [item]))


def criar_estorno(db: Session, ctx: Contexto, cartao_id: int, dados: dict) -> ItemFaturaSaida:
    cartao = faturas.travar_cartao(db, ctx, cartao_id)
    mes = validar_item(db, ctx, cartao, dados, "estorno")
    origem_id = dados.get("item_origem_id")
    if origem_id is not None:
        origem = _compra_do_cartao(db, ctx, cartao, origem_id)
        ja_estornado = _ja_estornado(db, origem.id)
        if ja_estornado + dados["valor"] > origem.valor:
            raise AppError(
                409, ESTORNO_SUPERA_COMPRA, "Estornos vinculados superam o valor da compra."
            )
    item = gravar_item(db, ctx, cartao, mes, dados, "estorno")
    faturas.sincronizar_pagamentos(db, cartao.id)
    db.commit()
    return saida_item(item, carregar_referencias(db, [item]))


def ajustar(
    db: Session, ctx: Contexto, cartao_id: int, mes: date, valor_banco: Decimal
) -> AjusteSaida:
    cartao = faturas.travar_cartao(db, ctx, cartao_id)
    if valor_banco < 0:
        raise invalido("valor_banco", "Valor do banco não pode ser negativo.")
    agora = hoje()
    fatura = faturas.calcular_mes(db, cartao, mes, agora)
    if fatura.status == "paga":
        raise AppError(409, FATURA_PAGA, "Fatura paga: desfaça o pagamento para alterar.")
    item = None
    if valor_banco != fatura.total:
        # Crédito que entra na fatura (c): recebido + repassado + bruto negativo.
        credito_entra = (
            fatura.credito_recebido + fatura.credito_repassado + min(fatura.bruto, Decimal(0))
        )
        dados = {
            "valor": valor_banco + credito_entra - fatura.bruto,
            "data": agora,
            "descricao": "Reajuste de fatura",
            "categoria_id": None,
        }
        item = gravar_item(db, ctx, cartao, mes, dados, "ajuste")
    faturas.sincronizar_pagamentos(db, cartao.id)
    db.commit()
    item_saida = None if item is None else saida_item(item, carregar_referencias(db, [item]))
    return AjusteSaida(item=item_saida, fatura=detalhe(db, ctx, cartao_id, mes))


def editar(
    db: Session, ctx: Contexto, item_id: int, dados: ItemEdicaoEntrada, alcance: Alcance | None
) -> ItemFaturaSaida:
    item = item_fatura_visivel(db, ctx, item_id)
    if item.serie_id is not None:
        if alcance is None:
            raise _alcance_ausente()
        series_cartao.editar(db, ctx, item, dados, alcance)
        return saida_item(item, carregar_referencias(db, [item]))

    cartao, fatura = _conferir_avulso(db, ctx, item)
    if item.tipo == "ajuste":
        raise AppError(409, ITEM_NAO_EDITAVEL, "Ajuste de fatura não é editável.")
    enviados = dados.model_fields_set
    tags_atuais = list(
        db.scalars(select(ItemFaturaTag.tag_id).where(ItemFaturaTag.item_fatura_id == item.id))
    )
    estado = {
        "valor": dados.valor if "valor" in enviados else item.valor,
        "data": dados.data if "data" in enviados else item.data,
        "descricao": dados.descricao if "descricao" in enviados else item.descricao,
        "categoria_id": dados.categoria_id if "categoria_id" in enviados else item.categoria_id,
        "observacao": dados.observacao if "observacao" in enviados else item.observacao,
        "tag_ids": dados.tag_ids if "tag_ids" in enviados else tags_atuais,
        # Estorno mantém a compra de origem: a edição não muda o vínculo.
        "item_origem_id": item.item_origem_id,
    }
    muda_fatura = "fatura_mes" in enviados
    if muda_fatura:
        estado["fatura_mes"] = dados.fatura_mes
    mes = validar_item(
        db,
        ctx,
        cartao,
        estado,
        item.tipo,
        atual=item,
        mes=None if muda_fatura else fatura.mes_ref,
    )
    if item.tipo == "compra":
        _conferir_estornos(db, item.id, estado["valor"])
    elif item.tipo == "estorno" and item.item_origem_id is not None:
        _conferir_teto_estorno(db, item, estado["valor"])
    gravar_item(db, ctx, cartao, mes, estado, item.tipo, atual=item)
    faturas.sincronizar_pagamentos(db, cartao.id)
    db.commit()
    return saida_item(item, carregar_referencias(db, [item]))


def excluir(db: Session, ctx: Contexto, item_id: int, alcance: Alcance | None) -> None:
    item = item_fatura_visivel(db, ctx, item_id)
    if item.serie_id is not None:
        if alcance is None:
            raise _alcance_ausente()
        series_cartao.excluir(db, ctx, item, alcance)
        return

    cartao, _ = _conferir_avulso(db, ctx, item)
    if db.scalar(select(ItemFatura.id).where(ItemFatura.item_origem_id == item.id).limit(1)):
        raise AppError(409, COMPRA_COM_ESTORNO, "Compra com estorno vinculado.")
    db.execute(delete(ItemFaturaTag).where(ItemFaturaTag.item_fatura_id == item.id))
    db.execute(delete(ItemFatura).where(ItemFatura.id == item.id))
    faturas.sincronizar_pagamentos(db, cartao.id)
    db.commit()


def obter(db: Session, ctx: Contexto, item_id: int) -> ItemFaturaSaida:
    item = item_fatura_visivel(db, ctx, item_id)
    return saida_item(item, carregar_referencias(db, [item]))


def detalhe(db: Session, ctx: Contexto, cartao_id: int, mes: date) -> FaturaSaida:
    ganchos.antes_de_ler_periodo(db, ctx, fim_do_mes(mes))
    cartao = cartao_visivel(db, ctx, cartao_id)
    conta = db.get(Conta, cartao.conta_id)
    calculada = faturas.calcular_mes(db, cartao, mes)
    itens: list[ItemFatura] = []
    if calculada.id is not None:
        itens = list(
            db.scalars(
                select(ItemFatura)
                .where(ItemFatura.fatura_id == calculada.id)
                .order_by(ItemFatura.data, ItemFatura.id)
            )
        )
    refs = carregar_referencias(db, itens)
    return FaturaSaida(
        **resumo_fatura(cartao, calculada).model_dump(),
        bruto=para_str(calculada.bruto),
        credito_recebido=para_str(calculada.credito_recebido),
        credito_repassado=para_str(calculada.credito_repassado),
        itens=[saida_item(item, refs) for item in itens],
        conta_arquivada=bool(conta.arquivado),
        pode_pagar=not conta.arquivado and calculada.total > 0 and calculada.pagamento is None,
        editavel=not conta.arquivado and calculada.status != "paga",
    )


def janela(
    db: Session,
    ctx: Contexto,
    cartao_id: int,
    de: str | None,
    ate: str | None,
    data: date | None,
) -> dict:
    agora = hoje()
    inicio = validar_mes(de, agora) if de is not None else somar_meses(mes_ref(agora), -2)
    fim = validar_mes(ate, agora) if ate is not None else somar_meses(mes_ref(agora), 12)
    quantidade = (fim.year - inicio.year) * 12 + fim.month - inicio.month + 1
    if not 1 <= quantidade <= 36:
        raise AppError(
            422,
            VALIDACAO,
            "Dados da janela inválidos.",
            campos={"ate": "Informe uma janela de até 36 meses, com o início antes do fim."},
        )
    if data is not None:
        validar_data(data, agora)
    cartao = cartao_visivel(db, ctx, cartao_id)
    ganchos.antes_de_ler_periodo(db, ctx, fim_do_mes(fim))
    calculadas = {
        f.mes: f
        for f in faturas.calcular(db, [cartao.id], ate_mes=fim, hoje=agora).get(cartao.id, [])
    }
    resumos = []
    for indice in range(quantidade):
        mes = somar_meses(inicio, indice)
        calculada = calculadas.get(mes) or faturas.fatura_virtual(cartao, mes, agora)
        resumos.append(resumo_fatura(cartao, calculada))
    sugerida = None
    if data is not None:
        sugerida = formatar_mes(
            mes_da_fatura(data, cartao.dia_fechamento, cartao.dia_vencimento)
        )
    return {"sugerida": sugerida, "faturas": resumos}


def _alcance_ausente() -> AppError:
    return invalido("alcance", "Informe o alcance para item de série.")


def _conferir_avulso(db: Session, ctx: Contexto, item: ItemFatura) -> tuple[Cartao, Fatura]:
    # Item avulso: conta ativa e fatura de origem não paga (RF-4.18, RF-4.19).
    fatura = db.get(Fatura, item.fatura_id)
    cartao = faturas.travar_cartao(db, ctx, fatura.cartao_id)
    if fatura_paga(db, fatura.id):
        raise AppError(409, FATURA_PAGA, "Fatura paga: desfaça o pagamento para alterar.")
    return cartao, fatura


def _ja_estornado(db: Session, compra_id: int, ignorar_id: int | None = None) -> Decimal:
    consulta = select(func.coalesce(func.sum(ItemFatura.valor), 0)).where(
        ItemFatura.item_origem_id == compra_id, ItemFatura.tipo == "estorno"
    )
    if ignorar_id is not None:
        consulta = consulta.where(ItemFatura.id != ignorar_id)
    return Decimal(db.scalar(consulta))


def _conferir_estornos(db: Session, compra_id: int, valor: Decimal) -> None:
    if _ja_estornado(db, compra_id) > valor:
        raise AppError(409, ESTORNO_SUPERA_COMPRA, "Estornos vinculados superam o valor da compra.")


def _conferir_teto_estorno(db: Session, estorno: ItemFatura, valor: Decimal) -> None:
    origem = db.get(ItemFatura, estorno.item_origem_id)
    if _ja_estornado(db, origem.id, ignorar_id=estorno.id) + valor > origem.valor:
        raise AppError(409, ESTORNO_SUPERA_COMPRA, "Estornos vinculados superam o valor da compra.")


def _compra_do_cartao(db: Session, ctx: Contexto, cartao: Cartao, item_id: int) -> ItemFatura:
    try:
        origem = item_fatura_visivel(db, ctx, item_id)
    except AppError:
        raise invalido("item_origem_id", "Compra de origem não encontrada.") from None
    fatura = db.get(Fatura, origem.fatura_id)
    if origem.tipo != "compra" or fatura.cartao_id != cartao.id:
        raise invalido("item_origem_id", "A compra de origem deve ser do mesmo cartão.")
    return origem
