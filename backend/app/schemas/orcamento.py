from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, BaseModel, field_validator

from app.money import Dinheiro
from app.schemas.meta import ValorNaoNegativo


def _entre_0_e_100(valor: Decimal) -> Decimal:
    if not 0 <= valor <= 100:
        raise ValueError("O percentual vai de 0 a 100.")
    return valor


Percentual = Annotated[Dinheiro, AfterValidator(_entre_0_e_100)]


class SubcategoriaEntrada(BaseModel):
    categoria_id: int
    limite: ValorNaoNegativo


class CategoriaEntrada(BaseModel):
    categoria_id: int
    limite: ValorNaoNegativo | None = None
    subcategorias: list[SubcategoriaEntrada] | None = None


class OrcamentoEntrada(BaseModel):
    renda: ValorNaoNegativo
    percentual_economia: Percentual
    categorias: list[CategoriaEntrada]

    @field_validator("categorias")
    @classmethod
    def _regras_das_categorias(cls, categorias: list[CategoriaEntrada]) -> list[CategoriaEntrada]:
        ids: list[int] = []
        for categoria in categorias:
            if (categoria.limite is None) == (categoria.subcategorias is None):
                raise ValueError("Informe o limite da categoria ou as subcategorias, exatamente um.")
            if categoria.subcategorias is not None and not categoria.subcategorias:
                raise ValueError("Informe ao menos uma subcategoria.")
            ids.append(categoria.categoria_id)
            ids.extend(sub.categoria_id for sub in categoria.subcategorias or [])
        if len(ids) != len(set(ids)):
            raise ValueError("Uma categoria aparece mais de uma vez no orçamento.")
        return categorias


class SubcategoriaSaida(BaseModel):
    categoria_id: int
    nome: str
    arquivada: bool
    limite: str


class CategoriaSaida(BaseModel):
    categoria_id: int
    nome: str
    icone: str
    cor: str
    arquivada: bool
    limite: str
    por_subcategoria: bool
    subcategorias: list[SubcategoriaSaida]


class ResumoSaida(BaseModel):
    renda: str
    gastos_planejados: str
    balanco_planejado: str
    economia_planejada: str | None


class OrcamentoSaida(BaseModel):
    id: int | None
    mes: str | None
    renda: str
    percentual_economia: str
    orcamento_gastos: str
    economia: str
    categorias: list[CategoriaSaida]
    total_categorizado: str
    falta_distribuir: str
    excedente: str
    resumo: ResumoSaida


class OrcamentoMesSaida(BaseModel):
    mes: str
    orcamento: OrcamentoSaida | None
    renda_sugerida: str


class ComparacaoLinha(BaseModel):
    categoria_id: int | None
    nome: str
    icone: str | None
    cor: str | None
    arquivada: bool
    limite: str | None
    gasto: str
    restante: str | None
    consumo: str | None
    acima_do_limite: bool


class ComparacaoLinhaCategoria(ComparacaoLinha):
    subcategorias: list[ComparacaoLinha]


class ComparacaoTotal(BaseModel):
    planejado: str
    gasto: str
    restante: str | None
    consumo: str | None
    acima_do_limite: bool


class ComparacaoSaida(BaseModel):
    mes: str
    linhas: list[ComparacaoLinhaCategoria]
    total: ComparacaoTotal
