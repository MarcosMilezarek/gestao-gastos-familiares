from pydantic import BaseModel


class PlanoMetaSaida(BaseModel):
    meses: int
    aplicacao_mensal: str
    total_a_aplicar: str
    atingida: bool
