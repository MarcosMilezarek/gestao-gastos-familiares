from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, EmailStr, Field


def _normalizar_email(valor: object) -> object:
    return valor.strip().lower() if isinstance(valor, str) else valor


Email = Annotated[EmailStr, BeforeValidator(_normalizar_email), Field(max_length=254)]


class ConviteEntrada(BaseModel):
    email: Email


class DesvincularEntrada(BaseModel):
    confirmar: bool


class ConviteEnviadoSaida(BaseModel):
    id: int
    email_convidado: str


class ConviteRecebidoSaida(BaseModel):
    id: int
    convidante_nome: str


class ParceiroSaida(BaseModel):
    id: int
    nome: str


class VinculoSaida(BaseModel):
    estado: Literal["sem_vinculo", "convite_enviado", "convite_recebido", "vinculado"]
    convite_enviado: ConviteEnviadoSaida | None
    convites_recebidos: list[ConviteRecebidoSaida]
    parceiro: ParceiroSaida | None
