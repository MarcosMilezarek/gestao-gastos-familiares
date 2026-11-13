from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

Tipo = Literal["despesa", "receita"]
Cor = Annotated[str, StringConstraints(pattern=r"^#[0-9A-Fa-f]{6}$")]
NomeCategoria = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=60),
]
Icone = Annotated[str, StringConstraints(min_length=1, max_length=40)]
NomeTag = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=40),
]


class CategoriaEntrada(BaseModel):
    tipo: Tipo
    nome: NomeCategoria
    icone: Icone
    cor: Cor | None = None
    categoria_pai_id: int | None = None


class CategoriaEdicao(BaseModel):
    nome: NomeCategoria | None = None
    icone: Icone | None = None
    cor: Cor | None = None


class ArquivarEntrada(BaseModel):
    mover_para_id: int | None = None


class MoverLancamentosEntrada(BaseModel):
    destino_id: int


class MovidosSaida(BaseModel):
    movidos: int


class SubcategoriaSaida(BaseModel):
    id: int
    nome: str
    tipo: Tipo
    icone: str
    cor: str
    fixa: bool
    arquivado: bool
    categoria_pai_id: int | None


class CategoriaSaida(SubcategoriaSaida):
    subcategorias: list[SubcategoriaSaida] = Field(default_factory=list)


class TagEntrada(BaseModel):
    nome: NomeTag


class TagSaida(BaseModel):
    id: int
    nome: str
