from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    Field,
    StringConstraints,
    field_serializer,
    field_validator,
)

from app.money import Dinheiro


def _maior_que_zero(valor: Decimal) -> Decimal:
    if valor <= 0:
        raise ValueError("Valor deve ser maior que zero.")
    return valor


def _sem_repeticao(tag_ids: list[int]) -> list[int]:
    if len(set(tag_ids)) != len(tag_ids):
        raise ValueError("Tag repetida na lista.")
    return tag_ids


ValorPositivo = Annotated[Dinheiro, AfterValidator(_maior_que_zero)]
Descricao = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=120),
]
Observacao = Annotated[str, StringConstraints(max_length=500)]
TagIds = Annotated[list[int], AfterValidator(_sem_repeticao)]
Situacao = Literal["prevista", "confirmada"]
Alcance = Literal["somente_este", "este_e_pendentes", "todos"]


class RecorrenciaEntrada(BaseModel):
    modo: Literal["sem_fim", "n_meses"]
    meses: int | None = None


class _LancamentoBase(BaseModel):
    valor: ValorPositivo
    data: date
    situacao: Situacao | None = None
    observacao: Observacao | None = None
    tag_ids: TagIds | None = None
    recorrencia: RecorrenciaEntrada | None = None


class _ComCategoria(_LancamentoBase):
    descricao: Descricao
    categoria_id: int
    dono_usuario_id: int | None
    conta_id: int


class DespesaEntrada(_ComCategoria):
    tipo: Literal["despesa"]


class ReceitaEntrada(_ComCategoria):
    tipo: Literal["receita"]


class TransferenciaEntrada(_LancamentoBase):
    tipo: Literal["transferencia"]
    descricao: Descricao | None = None
    conta_id: int
    conta_destino_id: int


LancamentoEntrada = Annotated[
    DespesaEntrada | ReceitaEntrada | TransferenciaEntrada,
    Field(discriminator="tipo"),
]


class LancamentoEdicaoEntrada(BaseModel):
    valor: ValorPositivo | None = None
    data: date | None = None
    descricao: Descricao | None = None
    categoria_id: int | None = None
    dono_usuario_id: int | None = None
    conta_id: int | None = None
    conta_destino_id: int | None = None
    situacao: Situacao | None = None
    observacao: Observacao | None = None
    tag_ids: TagIds | None = None
    # Só para recusar o campo em aplicação e resgate (checado por model_fields_set).
    meta_id: int | None = None

    @field_validator(
        "valor", "data", "categoria_id", "conta_id", "conta_destino_id", "situacao", "tag_ids"
    )
    @classmethod
    def _nao_anulavel(cls, valor: object) -> object:
        if valor is None:
            raise ValueError("Este campo não aceita nulo.")
        return valor


class ConfirmarEntrada(BaseModel):
    valor: ValorPositivo | None = None


class ReajusteEntrada(BaseModel):
    saldo_real: Dinheiro


class CategoriaRefSaida(BaseModel):
    id: int
    nome: str
    pai_nome: str | None
    cor: str
    icone: str


class TagSaida(BaseModel):
    id: int
    nome: str


class PessoaRefSaida(BaseModel):
    id: int
    nome: str


class MetaRefSaida(BaseModel):
    id: int
    nome: str


class LancamentoSaida(BaseModel):
    id: int
    tipo: str
    valor: str
    data: date
    situacao: str
    descricao: str | None
    categoria: CategoriaRefSaida | None
    dono_usuario_id: int | None
    conta_id: int
    conta_destino_id: int | None
    aporte: bool
    tags: list[TagSaida]
    observacao: str | None
    criado_por: PessoaRefSaida
    criado_em: datetime
    recorrente: bool
    recorrencia_id: int | None
    numero_recorrencia: int | None
    total_ocorrencias: int | None
    meta: MetaRefSaida | None

    @field_serializer("criado_em")
    def _instante_utc(self, valor: datetime) -> str:
        return valor.replace(tzinfo=UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")
