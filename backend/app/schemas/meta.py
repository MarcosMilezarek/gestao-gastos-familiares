from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, StringConstraints, field_validator

from app.money import Dinheiro
from app.schemas.categoria import Cor, Icone
from app.schemas.lancamento import ValorPositivo

NomeMeta = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=80),
]
DescricaoMeta = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=500),
]


def _nao_negativo(valor: Decimal) -> Decimal:
    if valor < 0:
        raise ValueError("Valor não pode ser negativo.")
    return valor


ValorNaoNegativo = Annotated[Dinheiro, AfterValidator(_nao_negativo)]


class MetaEntrada(BaseModel):
    nome: NomeMeta
    valor_alvo: ValorPositivo
    data_alvo: date | None = None
    valor_inicial: ValorNaoNegativo = Decimal(0)
    cor: Cor
    icone: Icone
    descricao: DescricaoMeta | None = None


class MetaEdicao(BaseModel):
    # data_alvo e descricao aceitam null (remove o valor); os demais não.
    nome: NomeMeta | None = None
    valor_alvo: ValorPositivo | None = None
    data_alvo: date | None = None
    valor_inicial: ValorNaoNegativo | None = None
    cor: Cor | None = None
    icone: Icone | None = None
    descricao: DescricaoMeta | None = None

    @field_validator("nome", "valor_alvo", "valor_inicial", "cor", "icone")
    @classmethod
    def _nao_anulavel(cls, valor: object) -> object:
        if valor is None:
            raise ValueError("Este campo não aceita nulo.")
        return valor


class MetaSaida(BaseModel):
    id: int
    nome: str
    valor_alvo: str
    data_alvo: date | None
    valor_inicial: str
    cor: str
    icone: str
    descricao: str | None
    valor_atual: str
    aplicado_liquido: str
    rendeu: str
    falta: str
    porcentagem: str
    situacao: Literal["em_andamento", "concluida"]
    casal_encerrado: bool


class MetasSaida(BaseModel):
    patrimonio_total: str
    metas: list[MetaSaida]


class MovimentoMeta(BaseModel):
    tipo: Literal["inicial", "aplicacao", "resgate", "rendimento"]
    id: int | None
    data: date
    valor: str
    situacao: Literal["confirmada", "prevista", "atrasada"] | None
    descricao: str | None


class MetaDetalhe(MetaSaida):
    movimentos: list[MovimentoMeta]
