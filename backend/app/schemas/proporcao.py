from typing import Literal

from pydantic import BaseModel


class PessoaProporcaoSaida(BaseModel):
    usuario_id: int
    nome: str
    porcentagem: str
    devido: str
    aportado: str
    faltante: str
    excedente: str


class ProporcaoSaida(BaseModel):
    mes: str
    base_despesas_casal: str
    origem_porcentagem: Literal["mes", "herdada", "padrao_50_50"]
    mes_origem: str | None
    pessoas: list[PessoaProporcaoSaida]


class SugestaoAporteSaida(BaseModel):
    valor: str | None
