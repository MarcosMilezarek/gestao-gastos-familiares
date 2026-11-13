import importlib
import logging
import pkgutil

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import routers
from app.config import get_settings
from app.deps import verificar_origem
from app.errors import (
    ERRO_HTTP,
    ERRO_INTERNO,
    METODO_NAO_PERMITIDO,
    NAO_ENCONTRADO,
    VALIDACAO,
    AppError,
)

logger = logging.getLogger(__name__)

_EM_DESENVOLVIMENTO = get_settings().APP_ENV == "dev"

app = FastAPI(
    title="SistemaCasal",
    docs_url="/docs" if _EM_DESENVOLVIMENTO else None,
    redoc_url="/redoc" if _EM_DESENVOLVIMENTO else None,
    openapi_url="/openapi.json" if _EM_DESENVOLVIMENTO else None,
    dependencies=[Depends(verificar_origem)],
)

_CABECALHOS_SEGURANCA = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
}


def _corpo_erro(codigo: str, mensagem: str, campos: dict[str, str] | None = None) -> dict:
    erro: dict = {"codigo": codigo, "mensagem": mensagem}
    if campos is not None:
        erro["campos"] = campos
    return {"erro": erro}


_MENSAGENS_FIXAS = {
    "missing": "Campo obrigatório.",
    "string_type": "Informe um texto.",
    "string_pattern_mismatch": "Formato inválido.",
    "int_type": "Informe um número inteiro.",
    "int_parsing": "Informe um número inteiro.",
    "decimal_type": "Informe um número.",
    "decimal_parsing": "Informe um número.",
    "float_parsing": "Informe um número.",
    "date_type": "Informe uma data no formato AAAA-MM-DD.",
    "date_parsing": "Informe uma data no formato AAAA-MM-DD.",
    "date_from_datetime_parsing": "Informe uma data no formato AAAA-MM-DD.",
    "datetime_type": "Informe data e hora no formato AAAA-MM-DDTHH:MM:SS.",
    "datetime_parsing": "Informe data e hora no formato AAAA-MM-DDTHH:MM:SS.",
    "bool_type": "Informe verdadeiro ou falso.",
    "bool_parsing": "Informe verdadeiro ou falso.",
    # Não lista as opções nem ecoa o valor recebido (comum §6.4).
    "enum": "Valor não permitido.",
    "literal_error": "Valor não permitido.",
}


def _mensagem_pydantic(erro: dict) -> str:
    # `input` nunca entra na mensagem: pode ser senha.
    tipo = erro["type"]
    if tipo == "json_invalid":
        return "O corpo da requisição não é um JSON válido."
    if tipo in _MENSAGENS_FIXAS:
        return _MENSAGENS_FIXAS[tipo]
    ctx = erro.get("ctx") or {}
    if tipo == "string_too_short":
        return f"Use pelo menos {ctx.get('min_length')} caracteres."
    if tipo == "string_too_long":
        return f"Use no máximo {ctx.get('max_length')} caracteres."
    if tipo == "too_short":
        return f"Informe pelo menos {ctx.get('min_length')} itens."
    if tipo == "too_long":
        return f"Informe no máximo {ctx.get('max_length')} itens."
    if tipo == "greater_than":
        return f"Informe um valor maior que {ctx.get('gt')}."
    if tipo == "greater_than_equal":
        return f"Informe um valor maior ou igual a {ctx.get('ge')}."
    if tipo == "less_than":
        return f"Informe um valor menor que {ctx.get('lt')}."
    if tipo == "less_than_equal":
        return f"Informe um valor menor ou igual a {ctx.get('le')}."
    if tipo == "value_error":
        # `error`: texto escrito pelo próprio validador, sem o valor recebido (comum §6.4).
        if "error" in ctx:
            return str(ctx["error"])
        # Hoje só o `email-validator` (EmailStr) preenche `reason`; se outro validador
        # passar a usá-lo, esta mensagem precisa ser revista.
        if "reason" in ctx:
            return "Informe um e-mail válido, como nome@exemplo.com."
    return "Valor inválido."


@app.exception_handler(AppError)
async def tratar_erro_de_aplicacao(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status,
        content=_corpo_erro(exc.codigo, exc.mensagem, exc.campos),
    )


@app.exception_handler(RequestValidationError)
async def tratar_erro_de_validacao(request: Request, exc: RequestValidationError) -> JSONResponse:
    campos: dict[str, str] = {}
    for erro in exc.errors():
        loc = erro["loc"]
        if erro["type"] == "json_invalid" or (len(loc) == 2 and isinstance(loc[1], int)):
            nome = "corpo"
        else:
            nome = ".".join(str(parte) for parte in loc[1:]) or "corpo"
        campos.setdefault(nome, _mensagem_pydantic(erro))
    return JSONResponse(
        status_code=422,
        content=_corpo_erro(
            VALIDACAO,
            "Dados inválidos; confira os campos informados.",
            campos,
        ),
    )


@app.exception_handler(StarletteHTTPException)
async def tratar_erro_http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    # Rota ou método inexistentes do framework; o `detail` nunca vai ao corpo.
    if exc.status_code == 404:
        codigo, mensagem = NAO_ENCONTRADO, "Recurso não encontrado."
    elif exc.status_code == 405:
        codigo, mensagem = METODO_NAO_PERMITIDO, "Método não permitido."
    else:
        codigo, mensagem = ERRO_HTTP, "Requisição não atendida."
    return JSONResponse(
        status_code=exc.status_code,
        content=_corpo_erro(codigo, mensagem),
        headers=exc.headers,
    )


@app.middleware("http")
async def cabecalhos_e_erro_interno(request: Request, call_next) -> Response:
    try:
        resposta = await call_next(request)
    except Exception:
        logger.exception("Erro inesperado em %s %s", request.method, request.url.path)
        resposta = JSONResponse(
            status_code=500,
            content=_corpo_erro(
                ERRO_INTERNO,
                "Erro interno do servidor. Tente novamente mais tarde.",
            ),
        )
    resposta.headers.update(_CABECALHOS_SEGURANCA)
    if request.url.path.startswith("/api"):
        resposta.headers["Cache-Control"] = "no-store"
    return resposta


@app.get("/api/saude")
def saude() -> dict[str, str]:
    return {"status": "ok"}


# Inclui todo módulo de `app.routers` que tenha `router` (D8); nenhuma conexão ao banco aqui.
for _info in pkgutil.iter_modules(routers.__path__, f"{routers.__name__}."):
    _modulo = importlib.import_module(_info.name)
    if hasattr(_modulo, "router"):
        app.include_router(_modulo.router)
