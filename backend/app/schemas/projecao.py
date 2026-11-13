from pydantic import BaseModel


class MesProjecaoSaida(BaseModel):
    mes: str
    previsto: bool
    entradas: str
    saidas: str
    transferencias_entrada: str
    transferencias_saida: str
    pagamentos_fatura: str
    aplicacoes_menos_resgates: str
    saldo_previsto: str


class ProjecaoSaida(BaseModel):
    conta_id: int | None
    horizonte: int
    meses: list[MesProjecaoSaida]
