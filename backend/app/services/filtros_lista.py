from dataclasses import dataclass
from datetime import date
from decimal import Decimal

_ZERO = Decimal(0)
_CLASSES_ENTRADA = frozenset({"receita"})
_CLASSES_SAIDA = frozenset({"despesa_conta", "despesa_cartao"})
_SITUACAO_POR_STATUS_FATURA = {
    "aberta": "prevista",
    "fechada": "prevista",
    "vencida": "atrasada",
    "paga": "confirmada",
    "zerada": "confirmada",
}


@dataclass(frozen=True)
class Linha:
    origem: str
    id: int | None
    classe: str
    data: date
    valor: Decimal
    conta_id: int | None
    conta_destino_id: int | None
    dono: int | None
    categoria_id: int | None
    categoria_raiz_id: int | None
    cartao_id: int | None
    situacao: str
    realizada: bool


@dataclass(frozen=True)
class FiltroLista:
    # Conjunto vazio = sem filtro; `None` em donos = casal.
    donos: frozenset[int | None] = frozenset()
    contas: frozenset[int] = frozenset()
    categorias: frozenset[int] = frozenset()
    tipos: frozenset[str] = frozenset()
    cartoes: frozenset[int] = frozenset()
    situacoes: frozenset[str] = frozenset()


@dataclass(frozen=True)
class ParValor:
    previsto: Decimal
    realizado: Decimal


@dataclass(frozen=True)
class ResumoValor:
    entradas: ParValor
    saidas: ParValor
    saldo: ParValor


def situacao_da_fatura(status: str) -> str:
    return _SITUACAO_POR_STATUS_FATURA[status]


def aplicar(linhas: list[Linha], filtro: FiltroLista) -> list[Linha]:
    return [linha for linha in linhas if _passa(linha, filtro)]


def _passa(linha: Linha, filtro: FiltroLista) -> bool:
    if filtro.donos and linha.dono not in filtro.donos:
        return False
    if filtro.contas and not (
        linha.conta_id in filtro.contas or linha.conta_destino_id in filtro.contas
    ):
        return False
    if filtro.categorias and not (
        linha.categoria_id in filtro.categorias or linha.categoria_raiz_id in filtro.categorias
    ):
        return False
    if filtro.tipos and linha.classe not in filtro.tipos:
        return False
    if filtro.cartoes and not (
        linha.origem == "cartao" and linha.cartao_id in filtro.cartoes
    ):
        return False
    return not filtro.situacoes or linha.situacao in filtro.situacoes


def totalizar(linhas: list[Linha]) -> ResumoValor:
    entradas_previsto = entradas_realizado = _ZERO
    saidas_previsto = saidas_realizado = _ZERO
    for linha in linhas:
        if linha.classe in _CLASSES_ENTRADA:
            entradas_previsto += linha.valor
            if linha.realizada:
                entradas_realizado += linha.valor
        elif linha.classe in _CLASSES_SAIDA:
            saidas_previsto += linha.valor
            if linha.realizada:
                saidas_realizado += linha.valor
    return ResumoValor(
        entradas=ParValor(entradas_previsto, entradas_realizado),
        saidas=ParValor(saidas_previsto, saidas_realizado),
        saldo=ParValor(
            entradas_previsto - saidas_previsto,
            entradas_realizado - saidas_realizado,
        ),
    )
