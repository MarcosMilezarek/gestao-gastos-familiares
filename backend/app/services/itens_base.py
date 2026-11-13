from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import date
from typing import TypeVar

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, aliased

from app.acesso import Contexto, categoria_visivel, tag_visivel
from app.errors import (
    CATEGORIA_ARQUIVADA,
    CATEGORIA_TIPO_INVALIDO,
    CONTA_ARQUIVADA,
    FATURA_PAGA,
    VALIDACAO,
    AppError,
)
from app.models.cartao import Cartao, Fatura
from app.models.categoria import Categoria, Tag
from app.models.conta import Conta
from app.models.item_fatura import ItemFatura, ItemFaturaTag, SerieCartao
from app.models.lancamento import Lancamento
from app.models.usuario import Usuario
from app.money import para_str
from app.schemas.item_fatura import ItemFaturaSaida, SerieItemSaida
from app.schemas.lancamento import CategoriaRefSaida, PessoaRefSaida, TagSaida
from app.services.fatura_calculo import mes_da_fatura
from app.services.faturas import obter_ou_criar
from app.tempo import formatar_mes, hoje, validar_data, validar_mes

T = TypeVar("T")


@dataclass(frozen=True)
class Referencias:
    """Dados de apoio carregados por IN para montar várias saídas sem consulta por item."""

    categorias: dict[int, CategoriaRefSaida]
    tags: dict[int, list[TagSaida]]
    series: dict[int, SerieCartao]
    faturas: dict[int, Fatura]
    pagas: set[int]
    criadores: dict[int, str]


def invalido(campo: str, mensagem: str) -> AppError:
    return AppError(422, VALIDACAO, "Dados do item inválidos.", campos={campo: mensagem})


def _achar(
    buscar: Callable[[Session, Contexto, int], T],
    db: Session,
    ctx: Contexto,
    ref_id: int,
    *,
    campo: str,
    mensagem: str,
) -> T:
    # Referência inválida no corpo é 422 genérico (D10), não 404.
    try:
        return buscar(db, ctx, ref_id)
    except AppError:
        raise invalido(campo, mensagem) from None


def faturas_pagas(db: Session, fatura_ids: Iterable[int]) -> set[int]:
    # Paga = pagamento de fatura confirmado; previsto não conta.
    return set(
        db.scalars(
            select(Lancamento.fatura_id).where(
                Lancamento.fatura_id.in_(list(fatura_ids)),
                Lancamento.tipo == "pagamento_fatura",
                Lancamento.situacao == "confirmada",
            )
        )
    )


def fatura_paga(db: Session, fatura_id: int) -> bool:
    return fatura_id in faturas_pagas(db, [fatura_id])


def mes_destino(cartao: Cartao, dados: dict, agora: date) -> date:
    """Mês da fatura de destino: `fatura_mes` informado, ou o sugerido pela data (RF-4.03)."""
    if dados.get("fatura_mes") is not None:
        try:
            return validar_mes(dados["fatura_mes"], agora)
        except AppError as erro:
            raise invalido("fatura_mes", erro.campos["mes"]) from None
    return mes_da_fatura(dados["data"], cartao.dia_fechamento, cartao.dia_vencimento)


def validar_item(
    db: Session,
    ctx: Contexto,
    cartao: Cartao,
    dados: dict,
    tipo: str,
    atual: ItemFatura | None = None,
    mes: date | None = None,
    ignorar_fatura_paga: bool = False,
) -> date:
    """Valida o estado resultante de um item e devolve o mês da fatura de destino.

    `mes` é a fatura do item (sem ele, vale `fatura_mes` ou a data). `ignorar_fatura_paga`
    só dispensa a recusa por fatura paga (alcance `todos` da edição de série, D-045).
    """
    agora = hoje()
    conta = db.get(Conta, cartao.conta_id)
    if conta.arquivado:
        raise AppError(409, CONTA_ARQUIVADA, "Conta arquivada.")

    if tipo in ("compra", "estorno"):
        categoria = _achar(
            categoria_visivel,
            db,
            ctx,
            dados["categoria_id"],
            campo="categoria_id",
            mensagem="Categoria não encontrada.",
        )
        if categoria.tipo != "despesa":
            raise AppError(409, CATEGORIA_TIPO_INVALIDO, "Categoria de outro tipo.")
        if categoria.arquivado and (atual is None or atual.categoria_id != categoria.id):
            raise AppError(409, CATEGORIA_ARQUIVADA, "Categoria arquivada.")

    for tag_id in dados.get("tag_ids") or ():
        _achar(tag_visivel, db, ctx, tag_id, campo="tag_ids", mensagem="Tag não encontrada.")

    parcelas = dados.get("parcelas")
    recorrencia = dados.get("recorrencia")
    if parcelas is not None and recorrencia is not None:
        raise invalido("parcelas", "Escolha parcelada ou recorrente.")
    if recorrencia is not None and recorrencia["modo"] == "n_meses":
        meses = recorrencia["meses"]
        if meses is None or not 2 <= meses <= 60:
            raise invalido("recorrencia", "Repita de 2 a 60 meses.")

    validar_data(dados["data"], agora)

    if mes is None:
        mes = mes_destino(cartao, dados, agora)

    fatura = db.scalar(
        select(Fatura).where(Fatura.cartao_id == cartao.id, Fatura.mes_ref == mes)
    )
    if fatura is not None and not ignorar_fatura_paga and fatura_paga(db, fatura.id):
        raise AppError(409, FATURA_PAGA, "Fatura paga: desfaça o pagamento para alterar.")
    return mes


def gravar_item(
    db: Session,
    ctx: Contexto,
    cartao: Cartao,
    mes: date,
    dados: dict,
    tipo: str,
    atual: ItemFatura | None = None,
) -> ItemFatura:
    """Grava o item (novo ou `atual`) na fatura do mês e substitui as tags. Não faz commit."""
    fatura = obter_ou_criar(db, cartao, mes)
    if atual is None:
        item = ItemFatura(tipo=tipo, conta_id=cartao.conta_id, criado_por_id=ctx.usuario_id)
        db.add(item)
    else:
        item = atual
    item.fatura_id = fatura.id
    item.valor = dados["valor"]
    item.data = dados["data"]
    item.descricao = dados["descricao"]
    item.categoria_id = dados.get("categoria_id")
    item.observacao = dados.get("observacao")
    item.item_origem_id = dados.get("item_origem_id")
    db.flush()
    db.execute(delete(ItemFaturaTag).where(ItemFaturaTag.item_fatura_id == item.id))
    db.add_all(
        ItemFaturaTag(item_fatura_id=item.id, tag_id=tag_id)
        for tag_id in dados.get("tag_ids") or ()
    )
    return item


def carregar_referencias(db: Session, itens: list[ItemFatura]) -> Referencias:
    ids = [item.id for item in itens]
    categorias_ids = {item.categoria_id for item in itens if item.categoria_id is not None}
    series_ids = {item.serie_id for item in itens if item.serie_id is not None}
    faturas_ids = {item.fatura_id for item in itens}
    criadores_ids = {item.criado_por_id for item in itens}

    pai = aliased(Categoria)
    categorias = {
        cat.id: CategoriaRefSaida(
            id=cat.id,
            nome=cat.nome,
            pai_nome=pai_cat.nome if pai_cat is not None else None,
            cor=pai_cat.cor if pai_cat is not None else cat.cor,
            icone=cat.icone,
        )
        for cat, pai_cat in db.execute(
            select(Categoria, pai)
            .outerjoin(pai, pai.id == Categoria.categoria_pai_id)
            .where(Categoria.id.in_(categorias_ids))
        )
    }
    tags: dict[int, list[TagSaida]] = {}
    for item_id, tag_id, tag_nome in db.execute(
        select(ItemFaturaTag.item_fatura_id, Tag.id, Tag.nome)
        .join(Tag, Tag.id == ItemFaturaTag.tag_id)
        .where(ItemFaturaTag.item_fatura_id.in_(ids))
        .order_by(Tag.id)
    ):
        tags.setdefault(item_id, []).append(TagSaida(id=tag_id, nome=tag_nome))
    series = {
        serie.id: serie
        for serie in db.scalars(select(SerieCartao).where(SerieCartao.id.in_(series_ids)))
    }
    faturas = {
        fatura.id: fatura
        for fatura in db.scalars(select(Fatura).where(Fatura.id.in_(faturas_ids)))
    }
    criadores = {
        uid: nome
        for uid, nome in db.execute(
            select(Usuario.id, Usuario.nome).where(Usuario.id.in_(criadores_ids))
        )
    }
    return Referencias(
        categorias=categorias,
        tags=tags,
        series=series,
        faturas=faturas,
        pagas=faturas_pagas(db, faturas_ids),
        criadores=criadores,
    )


def saida_item(item: ItemFatura, refs: Referencias) -> ItemFaturaSaida:
    fatura = refs.faturas[item.fatura_id]
    serie = refs.series.get(item.serie_id) if item.serie_id is not None else None
    # Na fatura, estorno aparece negativo; compra e ajuste já vêm com o sinal da fatura.
    valor = -item.valor if item.tipo == "estorno" else item.valor
    descricao = item.descricao
    total = None
    if serie is not None and serie.tipo == "parcelada":
        total = serie.numero_final
        descricao = f"{item.descricao} ({item.numero_serie}/{total})"
    return ItemFaturaSaida(
        id=item.id,
        tipo=item.tipo,
        valor=para_str(valor),
        data=item.data,
        descricao=descricao,
        descricao_base=item.descricao,
        categoria=refs.categorias.get(item.categoria_id),
        tags=refs.tags.get(item.id, []),
        observacao=item.observacao,
        serie=(
            SerieItemSaida(
                id=serie.id, tipo=serie.tipo, numero=item.numero_serie, total=total
            )
            if serie is not None
            else None
        ),
        item_origem_id=item.item_origem_id,
        fatura_mes=formatar_mes(fatura.mes_ref),
        fatura_paga=fatura.id in refs.pagas,
        criado_por=PessoaRefSaida(
            id=item.criado_por_id, nome=refs.criadores[item.criado_por_id]
        ),
    )
