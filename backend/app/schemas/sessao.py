from datetime import date
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    EmailStr,
    StringConstraints,
    model_validator,
)

SENHA_MINIMA = 8
# Login e senha atual não têm máximo no schema: o service responde como senha errada (§4.1).
SENHA_MAXIMA = 128
_EMAIL_MAXIMO = 254

Tema = Literal["claro", "escuro"]


def _normalizar_email(valor: object) -> object:
    if isinstance(valor, str):
        return valor.strip().lower()
    return valor


def _limitar_email(valor: str) -> str:
    if len(valor) > _EMAIL_MAXIMO:
        raise ValueError(f"Use no máximo {_EMAIL_MAXIMO} caracteres.")
    return valor


Email = Annotated[
    EmailStr,
    BeforeValidator(_normalizar_email),
    AfterValidator(_limitar_email),
]
Nome = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=80),
]
SenhaNova = Annotated[
    str,
    StringConstraints(min_length=SENHA_MINIMA, max_length=SENHA_MAXIMA),
]


class CadastroEntrada(BaseModel):
    nome: Nome
    email: Email
    senha: SenhaNova
    senha_confirmacao: str


class LoginEntrada(BaseModel):
    email: Email
    senha: str


class PerfilEntrada(BaseModel):
    nome: Nome | None = None
    tema: Tema | None = None

    @model_validator(mode="after")
    def exigir_um_campo(self) -> "PerfilEntrada":
        if self.nome is None and self.tema is None:
            raise ValueError("Informe nome ou tema.")
        return self


class AlterarSenhaEntrada(BaseModel):
    senha_atual: str
    senha_nova: SenhaNova


class UsuarioSaida(BaseModel):
    id: int
    nome: str
    email: str
    tema: Tema


class ParceiroSaida(BaseModel):
    id: int
    nome: str


class CasalSaida(BaseModel):
    id: int
    parceiro: ParceiroSaida


class SessaoSaida(BaseModel):
    usuario: UsuarioSaida
    hoje: date
    casal: CasalSaida | None
