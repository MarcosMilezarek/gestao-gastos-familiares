from datetime import date
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, field_validator

from app.schemas.conta import NomeConta
from app.schemas.lancamento import Situacao, ValorPositivo

DiaMes = Annotated[int, Field(ge=1, le=31)]
Bandeira = Annotated[str, StringConstraints(strip_whitespace=True, max_length=30)]


class CartaoEntrada(BaseModel):
    nome: NomeConta
    conta_id: int
    limite: ValorPositivo
    dia_fechamento: DiaMes
    dia_vencimento: DiaMes
    bandeira: Bandeira | None = None


class CartaoEdicao(BaseModel):
    # Conta dona não está aqui: não muda no PATCH (§3.1).
    nome: NomeConta | None = None
    limite: ValorPositivo | None = None
    dia_fechamento: DiaMes | None = None
    dia_vencimento: DiaMes | None = None
    bandeira: Bandeira | None = None

    @field_validator("nome", "limite", "dia_fechamento", "dia_vencimento")
    @classmethod
    def _nao_anulavel(cls, valor: object) -> object:
        if valor is None:
            raise ValueError("Este campo não aceita nulo.")
        return valor


class PagamentoSaida(BaseModel):
    lancamento_id: int
    data: date
    situacao: Situacao
    valor: str


class FaturaResumo(BaseModel):
    cartao_id: int
    cartao_nome: str
    conta_id: int
    mes: str
    id: int | None
    status: str
    fechamento: date
    vencimento: date
    valor: str
    pagamento: PagamentoSaida | None


class CartaoSaida(BaseModel):
    id: int
    nome: str
    conta_id: int
    dono_usuario_id: int | None
    limite: str
    dia_fechamento: int
    dia_vencimento: int
    bandeira: str | None
    conta_arquivada: bool
    limite_usado: str
    limite_disponivel: str
    uso_porcentagem: str | None
    fatura_corrente: FaturaResumo


class CartoesSaida(BaseModel):
    cartoes: list[CartaoSaida]
    limite_disponivel_total: str | None
    total_faturas_mes: str | None
