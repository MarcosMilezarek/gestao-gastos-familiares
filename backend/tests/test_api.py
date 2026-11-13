import ast
import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

from app.main import app

BACKEND = Path(__file__).resolve().parents[1]
SEGREDO = "SEGREDO-NAO-PODE-VAZAR"


class Entrada(BaseModel):
    nome: str = Field(min_length=3)
    idade: int = Field(ge=18, le=120)
    email: str


class Aninhado(BaseModel):
    itens: list[Entrada]


rotas = APIRouter()


@rotas.post("/api/_t/entrada")
def _entrada(dados: Entrada) -> dict:
    return {}


@rotas.post("/api/_t/aninhado")
def _aninhado(dados: Aninhado) -> dict:
    return {}


@rotas.get("/api/_t/explode")
def _explode() -> dict:
    raise RuntimeError(f"falha interna {SEGREDO}")


@rotas.get("/fora/ping")
def _fora() -> dict:
    return {}


app.include_router(rotas)
client = TestClient(app, raise_server_exceptions=False)


def test_saude_200():
    r = client.get("/api/saude")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_404_no_formato_unico():
    r = client.get("/api/nao-existe")
    assert r.status_code == 404
    assert r.json() == {"erro": {"codigo": "NAO_ENCONTRADO", "mensagem": "Recurso não encontrado."}}


def test_405_preserva_allow():
    r = client.post("/api/saude")
    assert r.status_code == 405
    assert r.json()["erro"]["codigo"] == "METODO_NAO_PERMITIDO"
    assert "GET" in r.headers["allow"]


def test_422_campos_por_loc_sem_body_e_mensagens_por_type():
    r = client.post("/api/_t/entrada", json={"nome": "ab", "idade": 5})
    assert r.status_code == 422
    erro = r.json()["erro"]
    assert erro["codigo"] == "VALIDACAO"
    assert erro["campos"] == {
        "nome": "Use pelo menos 3 caracteres.",
        "idade": "Informe um valor maior ou igual a 18.",
        "email": "Campo obrigatório.",
    }


def test_422_faixa_superior():
    r = client.post("/api/_t/entrada", json={"nome": "abc", "idade": 121, "email": "a"})
    assert r.json()["erro"]["campos"] == {"idade": "Informe um valor menor ou igual a 120."}


def test_422_tipo_errado_usa_mensagem_fixa():
    r = client.post("/api/_t/entrada", json={"nome": "abc", "idade": "xx", "email": "a"})
    assert r.json()["erro"]["campos"] == {"idade": "Informe um número inteiro."}


def test_422_json_malformado_em_campos_corpo():
    r = client.post(
        "/api/_t/entrada",
        content='{"nome": ',
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 422
    assert r.json()["erro"]["campos"] == {"corpo": "O corpo da requisição não é um JSON válido."}


def test_422_corpo_ausente_marca_campos_obrigatorios():
    r = client.post("/api/_t/entrada")
    assert r.status_code == 422
    assert set(r.json()["erro"]["campos"]) <= {"corpo", "nome", "idade", "email"}


def test_422_item_de_lista_indexado_vai_para_campos_com_caminho():
    r = client.post("/api/_t/aninhado", json={"itens": [{"nome": "ab", "idade": 20, "email": "a"}]})
    assert r.status_code == 422
    assert "itens.0.nome" in r.json()["erro"]["campos"]


def test_422_nunca_ecoa_o_valor_enviado():
    r = client.post("/api/_t/entrada", json={"nome": SEGREDO[:2], "idade": SEGREDO, "email": 1})
    assert r.status_code == 422
    assert SEGREDO not in r.text
    assert SEGREDO[:2] not in r.json()["erro"]["campos"]["nome"]


def test_500_generico_sem_traceback_nem_detalhe():
    r = client.get("/api/_t/explode")
    assert r.status_code == 500
    assert r.json() == {
        "erro": {
            "codigo": "ERRO_INTERNO",
            "mensagem": "Erro interno do servidor. Tente novamente mais tarde.",
        }
    }
    assert SEGREDO not in r.text
    assert "Traceback" not in r.text
    assert r.headers["cache-control"] == "no-store"
    assert r.headers["x-content-type-options"] == "nosniff"


def test_cache_control_no_store_em_api_inclusive_erros():
    for resp in (client.get("/api/saude"), client.get("/api/nao-existe")):
        assert resp.headers["cache-control"] == "no-store"


def test_cache_control_ausente_fora_de_api():
    r = client.get("/fora/ping")
    assert r.status_code == 200
    assert "cache-control" not in r.headers


def test_cabecalhos_de_seguranca_em_toda_resposta():
    for resp in (client.get("/api/saude"), client.get("/api/nao-existe"), client.get("/fora/ping")):
        assert resp.headers["x-content-type-options"] == "nosniff"
        assert resp.headers["x-frame-options"] == "DENY"
        assert resp.headers["referrer-policy"] == "same-origin"


def _docs_status(app_env: str | None) -> dict[str, int]:
    codigo = (
        "from fastapi.testclient import TestClient; from app.main import app; "
        "c = TestClient(app); "
        "print({p: c.get(p).status_code for p in ('/docs', '/redoc', '/openapi.json')})"
    )
    env = {k: v for k, v in os.environ.items() if k != "APP_ENV"}
    if app_env:
        env["APP_ENV"] = app_env
    r = subprocess.run(
        [sys.executable, "-c", codigo],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert r.returncode == 0, r.stderr
    return ast.literal_eval(r.stdout.strip().splitlines()[-1])


@pytest.mark.parametrize("app_env", [None, "prod"])
def test_docs_openapi_desligadas_em_prod(app_env):
    assert _docs_status(app_env) == {"/docs": 404, "/redoc": 404, "/openapi.json": 404}


def test_docs_openapi_ligadas_em_dev():
    assert _docs_status("dev") == {"/docs": 200, "/redoc": 200, "/openapi.json": 200}
