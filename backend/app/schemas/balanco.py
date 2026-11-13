from pydantic import BaseModel

from app.schemas.controle import Par, Resumo


class BalancoConta(BaseModel):
    conta_id: int
    nome: str
    dono_usuario_id: int | None
    entradas: Par
    saidas: Par
    transferencias_entrada: Par
    transferencias_saida: Par
    saldo: Par
    saldo_atual: str
    saldo_previsto: str


class DonoBalanco(BaseModel):
    dono_usuario_id: int | None
    nome: str
    entradas: Par
    saidas: Par
    saldo: Par


class BalancoMes(BaseModel):
    mes: str
    total: Resumo
    contas: list[BalancoConta]
    donos: list[DonoBalanco]
