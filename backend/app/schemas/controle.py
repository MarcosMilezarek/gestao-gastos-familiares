from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.errors import VALIDACAO, AppError
from app.money import para_str
from app.schemas.cartao import FaturaResumo
from app.schemas.lancamento import LancamentoSaida, MetaRefSaida
from app.services.filtros_lista import FiltroLista, ParValor, ResumoValor

TIPOS_LISTA = frozenset(
    {
        "despesa_conta",
        "receita",
        "despesa_cartao",
        "transferencia",
        "aporte",
        "aplicacao_resgate",
        "reajuste",
    }
)
SITUACOES_LISTA = frozenset({"confirmada", "prevista", "atrasada"})


class Par(BaseModel):
    previsto: str
    realizado: str


class Resumo(BaseModel):
    entradas: Par
    saidas: Par
    saldo: Par


def par_saida(valor: ParValor) -> Par:
    return Par(previsto=para_str(valor.previsto), realizado=para_str(valor.realizado))


def resumo_saida(valor: ResumoValor) -> Resumo:
    return Resumo(
        entradas=par_saida(valor.entradas),
        saidas=par_saida(valor.saidas),
        saldo=par_saida(valor.saldo),
    )


def _erro(campo: str, mensagem: str) -> AppError:
    return AppError(422, VALIDACAO, mensagem, campos={campo: mensagem})


def _ids(valores: list[str], campo: str) -> frozenset[int]:
    if not all(valor.isdecimal() for valor in valores):
        raise _erro(campo, "Filtro deve ser um id inteiro.")
    return frozenset(int(valor) for valor in valores)


def _donos(valores: list[str]) -> frozenset[int | None]:
    donos: set[int | None] = set()
    for valor in valores:
        if valor == "casal":
            donos.add(None)
        elif valor.isdecimal():
            donos.add(int(valor))
        else:
            raise _erro("dono", "Dono do filtro inválido.")
    return frozenset(donos)


def _enumerados(valores: list[str], validos: frozenset[str], campo: str) -> frozenset[str]:
    if not all(valor in validos for valor in valores):
        raise _erro(campo, "Valor de filtro inválido.")
    return frozenset(valores)


def filtro_dos_parametros(
    dono: list[str],
    conta_id: list[str],
    categoria_id: list[str],
    tipo: list[str],
    cartao_id: list[str],
    situacao: list[str],
) -> FiltroLista:
    return FiltroLista(
        donos=_donos(dono),
        contas=_ids(conta_id, "conta_id"),
        categorias=_ids(categoria_id, "categoria_id"),
        tipos=_enumerados(tipo, TIPOS_LISTA, "tipo"),
        cartoes=_ids(cartao_id, "cartao_id"),
        situacoes=_enumerados(situacao, SITUACOES_LISTA, "situacao"),
    )


class ItemLancamentoLista(BaseModel):
    kind: Literal["lancamento"]
    lancamento: LancamentoSaida
    conta_nome: str | None
    conta_destino_nome: str | None
    rotulo: str
    meta: MetaRefSaida | None = None


class ItemFaturaLista(BaseModel):
    kind: Literal["fatura"]
    data: date
    fatura: FaturaResumo


ItemLista = Annotated[ItemLancamentoLista | ItemFaturaLista, Field(discriminator="kind")]


class DiaLista(BaseModel):
    data: date
    itens: list[ItemLista]
    saldo_fim_do_dia: str


class ResumoLista(Resumo):
    saldo_atual_total: str


class ListaControle(BaseModel):
    mes: str
    filtros_ativos: bool
    resumo: ResumoLista
    dias: list[DiaLista]
