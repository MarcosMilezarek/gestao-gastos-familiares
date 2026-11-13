from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.acesso import Contexto, cartao_visivel, categoria_visivel, filtro_contas
from app.errors import VALIDACAO, AppError
from app.models.cartao import Cartao
from app.models.conta import Conta
from app.models.lancamento import Lancamento
from app.money import para_str
from app.schemas.controle import (
    DiaLista,
    ItemFaturaLista,
    ItemLancamentoLista,
    ItemLista,
    ListaControle,
    ResumoLista,
    resumo_saida,
)
from app.services import faturas
from app.services.cartoes import resumo_fatura
from app.services.filtros_lista import (
    FiltroLista,
    Linha,
    aplicar,
    situacao_da_fatura,
    totalizar,
)
from app.services.lancamentos import montar_saidas
from app.services.movimentos import carregar_mes, escopo_contas
from app.services.saldo_dia import saldo_fim_do_dia
from app.services.saldos import saldos_atuais
from app.tempo import formatar_mes

_ZERO = Decimal(0)
_ROTULO_POR_TIPO = {
    "despesa": "Despesa",
    "receita": "Receita",
    "transferencia": "Transferência",
    "reajuste": "Reajuste de saldo",
    "aplicacao": "Aplicação em meta",
    "resgate": "Resgate de meta",
}


def listar(db: Session, ctx: Contexto, mes: date, filtro: FiltroLista) -> ListaControle:
    _validar_donos(ctx, filtro)
    for cartao_id in filtro.cartoes:
        cartao_visivel(db, ctx, cartao_id)
    for categoria_id in filtro.categorias:
        categoria_visivel(db, ctx, categoria_id)
    contas = escopo_contas(db, ctx, sorted(filtro.contas))
    linhas = aplicar(carregar_mes(db, ctx, mes, contas), filtro)

    conta_ids_saldo = [conta.id for conta in _contas_do_saldo(contas, filtro)]
    atuais = saldos_atuais(db, conta_ids_saldo)

    itens_por_dia: dict[date, list[ItemLista]] = defaultdict(list)
    for item in _itens_lancamentos(db, ctx, linhas):
        itens_por_dia[item.lancamento.data].append(item)
    for item in _itens_faturas(db, ctx, mes, contas, filtro):
        itens_por_dia[item.data].append(item)

    datas = sorted(itens_por_dia)
    fins_de_dia = saldo_fim_do_dia(db, conta_ids_saldo, mes, datas)
    resumo = resumo_saida(totalizar(linhas))
    return ListaControle(
        mes=formatar_mes(mes),
        filtros_ativos=bool(
            filtro.donos
            or filtro.contas
            or filtro.categorias
            or filtro.tipos
            or filtro.cartoes
            or filtro.situacoes
        ),
        resumo=ResumoLista(
            saldo_atual_total=para_str(sum(atuais.values(), _ZERO)),
            entradas=resumo.entradas,
            saidas=resumo.saidas,
            saldo=resumo.saldo,
        ),
        dias=[
            DiaLista(
                data=data,
                itens=itens_por_dia[data],
                saldo_fim_do_dia=para_str(fins_de_dia[data]),
            )
            for data in datas
        ],
    )


def itens_de_lancamentos(
    db: Session, ctx: Contexto, lancamentos: list[Lancamento]
) -> list[ItemLancamentoLista]:
    saidas = montar_saidas(db, lancamentos)
    ids_contas = sorted(
        {saida.conta_id for saida in saidas}
        | {saida.conta_destino_id for saida in saidas if saida.conta_destino_id is not None}
    )
    nomes = dict(
        db.execute(
            select(Conta.id, Conta.nome).where(Conta.id.in_(ids_contas), filtro_contas(ctx))
        ).all()
    )
    return [
        ItemLancamentoLista(
            kind="lancamento",
            lancamento=saida,
            conta_nome=nomes.get(saida.conta_id),
            conta_destino_nome=None
            if saida.conta_destino_id is None
            else nomes.get(saida.conta_destino_id),
            rotulo="Aporte" if saida.aporte else _ROTULO_POR_TIPO[saida.tipo],
            meta=saida.meta,
        )
        for saida in saidas
    ]


def _validar_donos(ctx: Contexto, filtro: FiltroLista) -> None:
    for dono in filtro.donos:
        if dono is None:
            valido = ctx.casal_ativo_id is not None
        else:
            valido = dono in (ctx.usuario_id, ctx.parceiro_id)
        if not valido:
            mensagem = "Dono do filtro inválido."
            raise AppError(422, VALIDACAO, mensagem, campos={"dono": mensagem})


def _contas_do_saldo(contas: list[Conta], filtro: FiltroLista) -> list[Conta]:
    if not filtro.donos:
        return contas
    return [conta for conta in contas if conta.usuario_id in filtro.donos]


def _itens_lancamentos(
    db: Session, ctx: Contexto, linhas: list[Linha]
) -> list[ItemLancamentoLista]:
    ids = [linha.id for linha in linhas if linha.origem == "lancamento"]
    if not ids:
        return []
    lancamentos = db.scalars(
        select(Lancamento).where(Lancamento.id.in_(ids)).order_by(Lancamento.id)
    ).all()
    return itens_de_lancamentos(db, ctx, list(lancamentos))


def _itens_faturas(
    db: Session,
    ctx: Contexto,
    mes: date,
    contas: list[Conta],
    filtro: FiltroLista,
) -> list[ItemFaturaLista]:
    if filtro.categorias:
        return []
    contas_por_id = {conta.id: conta for conta in contas}
    calculadas = faturas.faturas_do_mes(db, ctx, mes, list(contas_por_id))
    if not calculadas:
        return []
    cartoes = {
        cartao.id: cartao
        for cartao in db.scalars(
            select(Cartao).where(Cartao.id.in_(sorted({f.cartao_id for f in calculadas})))
        )
    }
    visiveis = [
        fatura
        for fatura in sorted(calculadas, key=lambda fatura: fatura.cartao_id)
        if aplicar([_linha_fatura(fatura, contas_por_id)], filtro)
    ]
    return [
        ItemFaturaLista(
            kind="fatura",
            data=fatura.vencimento,
            fatura=resumo_fatura(cartoes[fatura.cartao_id], fatura),
        )
        for fatura in visiveis
    ]


def _linha_fatura(fatura: faturas.FaturaCalculada, contas_por_id: dict[int, Conta]) -> Linha:
    # Linha só para o filtro: os totais vêm de `carregar_mes`, não daqui.
    situacao = situacao_da_fatura(fatura.status)
    return Linha(
        origem="cartao",
        id=None,
        classe="despesa_cartao",
        data=fatura.vencimento,
        valor=fatura.total,
        conta_id=fatura.conta_id,
        conta_destino_id=None,
        dono=contas_por_id[fatura.conta_id].usuario_id,
        categoria_id=None,
        categoria_raiz_id=None,
        cartao_id=fatura.cartao_id,
        situacao=situacao,
        realizada=situacao == "confirmada",
    )
