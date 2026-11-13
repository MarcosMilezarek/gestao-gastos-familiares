from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints, field_validator

from app.money import Dinheiro
from app.schemas.lancamento import LancamentoSaida

TipoConta = Literal[
    "conta_corrente", "dinheiro", "poupanca", "investimentos", "vr_va", "outros"
]
NomeConta = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=60),
]
Instituicao = Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)]
Cor = Annotated[str, StringConstraints(pattern=r"^#[0-9A-Fa-f]{6}$")]


class ContaEdicaoEntrada(BaseModel):
    # Dono e vínculo não estão aqui: nunca mudam no PATCH (D11).
    nome: NomeConta | None = None
    instituicao: Instituicao | None = None
    tipo: TipoConta | None = None
    cor: Cor | None = None
    saldo_inicial: Dinheiro | None = None

    @field_validator("nome", "tipo", "cor", "saldo_inicial")
    @classmethod
    def _nao_anulavel(cls, valor: object) -> object:
        if valor is None:
            raise ValueError("Este campo não aceita nulo.")
        return valor


class ContaSaida(BaseModel):
    id: int
    nome: str
    instituicao: str | None
    tipo: str
    cor: str
    saldo_inicial: str
    dono_usuario_id: int | None
    arquivado: bool
    casal_encerrado: bool
    saldo_atual: str
    saldo_previsto: str


class ContasSaida(BaseModel):
    mes: str
    contas: list[ContaSaida]
    total_saldo_atual: str | None
    total_saldo_previsto: str | None


class ReajusteSaida(BaseModel):
    conta: ContaSaida
    lancamento: LancamentoSaida | None
