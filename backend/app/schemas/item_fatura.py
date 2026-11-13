from datetime import date
from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field, field_validator

from app.money import Dinheiro
from app.schemas.cartao import FaturaResumo
from app.schemas.lancamento import (
    CategoriaRefSaida,
    Descricao,
    Observacao,
    PessoaRefSaida,
    RecorrenciaEntrada,
    TagIds,
    TagSaida,
    ValorPositivo,
)

Parcelas = Annotated[int, Field(ge=2, le=36)]


def _nao_negativo(valor: Decimal) -> Decimal:
    if valor < 0:
        raise ValueError("Valor não pode ser negativo.")
    return valor


ValorNaoNegativo = Annotated[Dinheiro, AfterValidator(_nao_negativo)]


class CompraEntrada(BaseModel):
    valor: ValorPositivo
    data: date
    descricao: Descricao
    categoria_id: int
    fatura_mes: str | None = None
    tag_ids: TagIds | None = None
    observacao: Observacao | None = None
    parcelas: Parcelas | None = None
    recorrencia: RecorrenciaEntrada | None = None


class EstornoEntrada(BaseModel):
    valor: ValorPositivo
    data: date
    descricao: Descricao
    categoria_id: int
    fatura_mes: str | None = None
    item_origem_id: int | None = None
    tag_ids: TagIds | None = None
    observacao: Observacao | None = None


class AjusteEntrada(BaseModel):
    valor_banco: ValorNaoNegativo


class ItemEdicaoEntrada(BaseModel):
    # Estrutura da série (parcelas, recorrência) e a origem do estorno não mudam na edição (§4.5).
    valor: ValorPositivo | None = None
    data: date | None = None
    descricao: Descricao | None = None
    categoria_id: int | None = None
    fatura_mes: str | None = None
    tag_ids: TagIds | None = None
    observacao: Observacao | None = None

    @field_validator("valor", "data", "descricao", "categoria_id", "fatura_mes", "tag_ids")
    @classmethod
    def _nao_anulavel(cls, valor: object) -> object:
        if valor is None:
            raise ValueError("Este campo não aceita nulo.")
        return valor


class SerieItemSaida(BaseModel):
    id: int
    tipo: str
    numero: int
    total: int | None


class ItemFaturaSaida(BaseModel):
    id: int
    tipo: str
    valor: str
    data: date
    descricao: str
    descricao_base: str
    categoria: CategoriaRefSaida | None
    tags: list[TagSaida]
    observacao: str | None
    serie: SerieItemSaida | None
    item_origem_id: int | None
    fatura_mes: str
    fatura_paga: bool
    criado_por: PessoaRefSaida


class FaturaSaida(FaturaResumo):
    bruto: str
    credito_recebido: str
    credito_repassado: str
    itens: list[ItemFaturaSaida]
    conta_arquivada: bool
    pode_pagar: bool
    editavel: bool


class AjusteSaida(BaseModel):
    item: ItemFaturaSaida | None
    fatura: FaturaSaida
