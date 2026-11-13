from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints, field_validator

from app.schemas.lancamento import ValorPositivo

NomeCenario = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=80),
]
DescricaoItem = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=120),
]


class CenarioEntrada(BaseModel):
    nome: NomeCenario


class CenarioEdicao(BaseModel):
    nome: NomeCenario


class ItemEntrada(BaseModel):
    tipo: Literal["renda", "despesa"]
    dono_usuario_id: int | None = None
    descricao: DescricaoItem
    valor: ValorPositivo


class ItemEdicao(BaseModel):
    # tipo não muda, então não está aqui. dono_usuario_id aceita null (vale para despesa);
    # a regra por tipo é conferida no service.
    dono_usuario_id: int | None = None
    descricao: DescricaoItem | None = None
    valor: ValorPositivo | None = None

    @field_validator("descricao", "valor")
    @classmethod
    def _nao_anulavel(cls, valor: object) -> object:
        if valor is None:
            raise ValueError("Este campo não aceita nulo.")
        return valor


class CenarioResumo(BaseModel):
    id: int
    nome: str
    total_rendas: str
    total_despesas: str
    saldo_mensal: str


class ItemSaida(BaseModel):
    id: int
    tipo: Literal["renda", "despesa"]
    dono_usuario_id: int | None
    dono_nome: str
    descricao: str
    valor: str


class PessoaResultado(BaseModel):
    usuario_id: int
    nome: str
    renda: str
    porcentagem: str | None
    aporte: str | None
    despesas_proprias: str
    sobra: str | None


class ResultadoSaida(BaseModel):
    total_rendas: str
    total_despesas: str
    saldo_mensal: str
    sem_proporcao: bool
    base_casal: str
    pessoas: list[PessoaResultado]


class CenarioSaida(BaseModel):
    id: int
    nome: str
    itens: list[ItemSaida]
    resultado: ResultadoSaida
