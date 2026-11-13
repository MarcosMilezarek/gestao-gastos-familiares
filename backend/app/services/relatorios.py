from datetime import date
from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.acesso import Contexto
from app.models.casal import Casal
from app.models.categoria import Categoria
from app.models.usuario import Usuario
from app.money import para_str, porcentagem
from app.schemas.relatorios import (
    CategoriaRelatorio,
    ItemContaRelatorio,
    ItemDonoRelatorio,
    MesBalancoRelatorio,
    RelatorioBalancoMensal,
    RelatorioCategorias,
    RelatorioConta,
    RelatorioDono,
    RelatorioProporcao,
    SubcategoriaRelatorio,
)
from app.services import balanco, proporcao
from app.services.filtros_lista import Linha, totalizar
from app.services.movimentos import carregar_mes, escopo_contas, gasto_por_categoria
from app.tempo import formatar_mes, somar_meses

_ZERO = Decimal("0.00")
_PRIMEIRO_MES = date(2000, 1, 1)
_NOME_AJUSTE = "Reajuste de fatura"


def _porcentagem_texto(valor: Decimal, total: Decimal) -> str:
    parte = porcentagem(valor, total)
    return "0.00" if parte is None else para_str(parte)


def _categorias_com_pai(db: Session, ids: set[int]) -> dict[int, Categoria]:
    if not ids:
        return {}
    consulta = select(Categoria).where(
        or_(
            Categoria.id.in_(ids),
            Categoria.id.in_(select(Categoria.categoria_pai_id).where(Categoria.id.in_(ids))),
        )
    )
    return {categoria.id: categoria for categoria in db.scalars(consulta)}


def categorias(db: Session, ctx: Contexto, mes: date) -> RelatorioCategorias:
    gastos = gasto_por_categoria(db, ctx, mes)
    total = sum(gastos.values(), _ZERO)
    cats = _categorias_com_pai(db, {id_ for id_ in gastos if id_ is not None})
    proprio: dict[int, Decimal] = {}
    filhas: dict[int, dict[int, Decimal]] = {}
    for categoria_id, valor in gastos.items():
        if categoria_id is None:
            continue
        categoria = cats[categoria_id]
        if categoria.categoria_pai_id is None:
            proprio[categoria_id] = valor
        else:
            filhas.setdefault(categoria.categoria_pai_id, {})[categoria_id] = valor

    grupos: list[tuple[Decimal, CategoriaRelatorio]] = []
    for raiz_id in set(proprio) | set(filhas):
        raiz = cats[raiz_id]
        direto = proprio.get(raiz_id, _ZERO)
        subs = filhas.get(raiz_id, {})
        valor = direto + sum(subs.values(), _ZERO)
        subcategorias = [
            SubcategoriaRelatorio(
                categoria_id=sub_id,
                nome=cats[sub_id].nome,
                icone=cats[sub_id].icone,
                cor=raiz.cor,
                valor=para_str(sub_valor),
                valor_direto=para_str(sub_valor),
                porcentagem=_porcentagem_texto(sub_valor, total),
            )
            for sub_id, sub_valor in sorted(subs.items(), key=lambda item: item[1], reverse=True)
        ]
        grupos.append(
            (
                valor,
                CategoriaRelatorio(
                    categoria_id=raiz_id,
                    nome=raiz.nome,
                    icone=raiz.icone,
                    cor=raiz.cor,
                    valor=para_str(valor),
                    valor_direto=para_str(direto),
                    porcentagem=_porcentagem_texto(valor, total),
                    subcategorias=subcategorias,
                ),
            )
        )
    if None in gastos:
        ajuste = gastos[None]
        grupos.append(
            (
                ajuste,
                CategoriaRelatorio(
                    categoria_id=None,
                    nome=_NOME_AJUSTE,
                    icone=None,
                    cor=None,
                    valor=para_str(ajuste),
                    valor_direto=para_str(ajuste),
                    porcentagem=_porcentagem_texto(ajuste, total),
                    subcategorias=[],
                ),
            )
        )
    grupos.sort(key=lambda grupo: grupo[0], reverse=True)
    return RelatorioCategorias(
        mes=formatar_mes(mes),
        total=para_str(total),
        categorias=[categoria for _, categoria in grupos],
    )


def _saidas(linhas: list[Linha]) -> Decimal:
    return totalizar(linhas).saidas.previsto


def _donos(db: Session, ctx: Contexto) -> list[tuple[int | None, str]]:
    if ctx.casal_ativo_id is None:
        return [(ctx.usuario_id, db.get(Usuario, ctx.usuario_id).nome)]
    casal = db.get(Casal, ctx.casal_ativo_id)
    return [
        (casal.pessoa_a_id, db.get(Usuario, casal.pessoa_a_id).nome),
        (casal.pessoa_b_id, db.get(Usuario, casal.pessoa_b_id).nome),
        (None, "Casal"),
    ]


def despesas_por_dono(db: Session, ctx: Contexto, mes: date) -> RelatorioDono:
    linhas = carregar_mes(db, ctx, mes, escopo_contas(db, ctx))
    total = _saidas(linhas)
    itens = []
    for dono_id, nome in _donos(db, ctx):
        valor = _saidas([linha for linha in linhas if linha.dono == dono_id])
        itens.append(
            ItemDonoRelatorio(
                dono_usuario_id=dono_id,
                nome=nome,
                valor=para_str(valor),
                porcentagem=_porcentagem_texto(valor, total),
            )
        )
    return RelatorioDono(mes=formatar_mes(mes), total=para_str(total), itens=itens)


def despesas_por_conta(db: Session, ctx: Contexto, mes: date) -> RelatorioConta:
    contas = escopo_contas(db, ctx)
    linhas = carregar_mes(db, ctx, mes, contas)
    total = _saidas(linhas)
    itens = []
    for conta in contas:
        valor = _saidas([linha for linha in linhas if linha.conta_id == conta.id])
        itens.append(
            ItemContaRelatorio(
                conta_id=conta.id,
                nome=conta.nome,
                valor=para_str(valor),
                porcentagem=_porcentagem_texto(valor, total),
            )
        )
    return RelatorioConta(mes=formatar_mes(mes), total=para_str(total), itens=itens)


def _seis_meses(mes: date) -> list[date]:
    meses = [somar_meses(mes, n) for n in range(-5, 1)]
    return [m for m in meses if m >= _PRIMEIRO_MES]


def balanco_mensal(db: Session, ctx: Contexto, mes: date) -> RelatorioBalancoMensal:
    meses = []
    for m in _seis_meses(mes):
        total = balanco.calcular(db, ctx, m).total
        meses.append(
            MesBalancoRelatorio(
                mes=formatar_mes(m),
                entradas=total.entradas,
                saidas=total.saidas,
                saldo=total.saldo,
            )
        )
    return RelatorioBalancoMensal(meses=meses)


def proporcao_mensal(db: Session, ctx: Contexto, mes: date) -> RelatorioProporcao:
    return RelatorioProporcao(
        meses=[proporcao.proporcao_do_mes(db, ctx, m) for m in _seis_meses(mes)]
    )
