from datetime import date

from pydantic import BaseModel

from app.schemas.balanco import BalancoConta
from app.schemas.cartao import FaturaResumo
from app.schemas.controle import ItemLista
from app.schemas.projecao import ProjecaoSaida
from app.schemas.proporcao import ProporcaoSaida
from app.schemas.relatorios import RelatorioCategorias


class SaldoCard(BaseModel):
    conta_id: int
    nome: str
    dono_usuario_id: int | None
    saldo_atual: str


class CardsInicio(BaseModel):
    saldos: list[SaldoCard]
    total_faturas_mes: str


class InicioSaida(BaseModel):
    mes: str
    hoje: date
    cards: CardsInicio
    proporcao: ProporcaoSaida | None
    pendentes: list[ItemLista]
    despesas_por_categoria: RelatorioCategorias
    balanco_contas: list[BalancoConta]
    proximas_faturas: list[FaturaResumo]
    projecao: ProjecaoSaida
