from pydantic import BaseModel

from app.schemas.controle import Par
from app.schemas.proporcao import ProporcaoSaida


class SubcategoriaRelatorio(BaseModel):
    categoria_id: int
    nome: str
    icone: str
    cor: str
    valor: str
    valor_direto: str
    porcentagem: str


class CategoriaRelatorio(BaseModel):
    categoria_id: int | None
    nome: str
    icone: str | None
    cor: str | None
    valor: str
    valor_direto: str
    porcentagem: str
    subcategorias: list[SubcategoriaRelatorio]


class RelatorioCategorias(BaseModel):
    mes: str
    total: str
    categorias: list[CategoriaRelatorio]


class ItemDonoRelatorio(BaseModel):
    dono_usuario_id: int | None
    nome: str
    valor: str
    porcentagem: str


class RelatorioDono(BaseModel):
    mes: str
    total: str
    itens: list[ItemDonoRelatorio]


class ItemContaRelatorio(BaseModel):
    conta_id: int
    nome: str
    valor: str
    porcentagem: str


class RelatorioConta(BaseModel):
    mes: str
    total: str
    itens: list[ItemContaRelatorio]


class MesBalancoRelatorio(BaseModel):
    mes: str
    entradas: Par
    saidas: Par
    saldo: Par


class RelatorioBalancoMensal(BaseModel):
    meses: list[MesBalancoRelatorio]


class RelatorioProporcao(BaseModel):
    meses: list[ProporcaoSaida]
