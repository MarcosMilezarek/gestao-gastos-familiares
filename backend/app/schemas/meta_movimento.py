from datetime import date
from typing import Annotated

from pydantic import AfterValidator, BaseModel, field_validator

from app.money import Dinheiro
from app.schemas.lancamento import Descricao, Situacao, ValorPositivo
from app.schemas.meta import MetaSaida, ValorNaoNegativo


def _diferente_de_zero(valor: object) -> object:
    if valor == 0:
        raise ValueError("Valor não pode ser zero.")
    return valor


ValorComSinal = Annotated[Dinheiro, AfterValidator(_diferente_de_zero)]


class MovimentoEntrada(BaseModel):
    valor: ValorPositivo
    data: date
    descricao: Descricao | None = None
    situacao: Situacao | None = None


class RendimentoEntrada(BaseModel):
    valor_atual: ValorNaoNegativo


class RendimentoEdicao(BaseModel):
    valor: ValorComSinal | None = None
    data: date | None = None

    @field_validator("valor", "data")
    @classmethod
    def _nao_anulavel(cls, valor: object) -> object:
        if valor is None:
            raise ValueError("Este campo não aceita nulo.")
        return valor


class RendimentoSaida(BaseModel):
    id: int
    meta_id: int
    data: date
    valor: str


class RendimentoResultado(BaseModel):
    rendimento: RendimentoSaida | None
    meta: MetaSaida
