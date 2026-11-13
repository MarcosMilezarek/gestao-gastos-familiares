from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    DATABASE_URL: str
    APP_ENV: Literal["dev", "prod"] = "prod"
    APP_TZ: str = "America/Sao_Paulo"
    SESSAO_DIAS: int = Field(30, ge=1)
    COOKIE_SECURE: bool | None = None
    ORIGENS_PERMITIDAS: Annotated[list[str], NoDecode] = ["http://localhost:5173"]

    @field_validator("APP_TZ")
    @classmethod
    def validar_fuso(cls, valor: str) -> str:
        try:
            ZoneInfo(valor)
        except (ZoneInfoNotFoundError, ValueError) as erro:
            raise ValueError(
                f"APP_TZ inválido: {valor!r}; use um fuso do IANA, ex.: America/Sao_Paulo."
            ) from erro
        return valor

    @field_validator("ORIGENS_PERMITIDAS", mode="before")
    @classmethod
    def separar_origens(cls, valor: object) -> object:
        if isinstance(valor, str):
            return [origem.strip() for origem in valor.split(",") if origem.strip()]
        return valor

    @model_validator(mode="after")
    def definir_cookie_secure(self) -> "Settings":
        if self.COOKIE_SECURE is None:
            self.COOKIE_SECURE = self.APP_ENV == "prod"
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
