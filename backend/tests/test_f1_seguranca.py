"""Fatia 1: segredos fora das respostas, cookie `sid`, Origin e erro 422 sem eco."""
import json

import pytest
from fabricas import SENHA_PADRAO

from app.config import Settings
from app.routers import sessao as router_sessao

SENHA_RECONHECIVEL = "SegredoUnico-9Zq7"


def _cadastro(nome="Ana", email="ana@example.com", senha=SENHA_RECONHECIVEL):
    return {"nome": nome, "email": email, "senha": senha, "senha_confirmacao": senha}


def _hash_do_banco(sessao_direta, email: str) -> str:
    from sqlalchemy import text

    return (
        sessao_direta()
        .execute(text("SELECT senha_hash FROM usuario WHERE email = :e"), {"e": email})
        .scalar_one()
    )


# ------------------------------------------------------------------ CA-N.03
def test_nenhuma_resposta_contem_a_senha_ou_o_hash(fab, sessao_direta):
    c = fab.cliente()
    respostas = [c.post("/api/cadastro", json=_cadastro())]
    hash_ = _hash_do_banco(sessao_direta, "ana@example.com")
    assert hash_.startswith("$")
    respostas += [
        c.get("/api/sessao"),
        c.patch("/api/perfil", json={"nome": "Ana B", "tema": "escuro"}),
        c.post(  # senha atual errada: erro não ecoa nada
            "/api/perfil/senha",
            json={"senha_atual": "errada-Zq7-xx", "senha_nova": "nova-Zq7-xxxx"},
        ),
        c.post(  # senha curta: 422 não ecoa o valor
            "/api/perfil/senha",
            json={"senha_atual": SENHA_RECONHECIVEL, "senha_nova": "curta"},
        ),
        fab.cliente().post(
            "/api/sessao", json={"email": "ana@example.com", "senha": "errada-Zq7-xx"}
        ),
        fab.cliente().post(
            "/api/cadastro", json=_cadastro()  # e-mail repetido
        ),
        fab.cliente().post(
            "/api/cadastro", json={**_cadastro(email="b@example.com"), "senha_confirmacao": "diferente-Zq7"}
        ),
        fab.cliente().post(
            "/api/sessao", json={"email": "ana@example.com", "senha": SENHA_RECONHECIVEL}
        ),
        c.get("/api/contas"),
    ]
    enviados = [SENHA_RECONHECIVEL, "errada-Zq7-xx", "nova-Zq7-xxxx", "diferente-Zq7", "curta"]
    for r in respostas:
        corpo = r.text
        assert hash_ not in corpo
        assert "senha_hash" not in corpo
        assert "argon2" not in corpo
        for segredo in enviados[:-1]:
            assert segredo not in corpo, f"{r.request.method} {r.request.url.path} ecoou a senha"
        assert "senha_hash" not in json.dumps(dict(r.headers))


def test_senha_em_erro_422_de_outros_formatos_nao_e_ecoada(fab):
    c = fab.cliente()
    r = c.post("/api/cadastro", content=b'{"senha": "' + SENHA_RECONHECIVEL.encode() + b'"', headers={"Content-Type": "application/json"})
    assert r.status_code == 422
    assert SENHA_RECONHECIVEL not in r.text
    r = c.post("/api/cadastro", json={"nome": "A", "email": "a@b.co", "senha": 12345678901, "senha_confirmacao": SENHA_RECONHECIVEL})
    assert r.status_code == 422
    assert SENHA_RECONHECIVEL not in r.text
    assert "12345678901" not in r.text


# ------------------------------------------------------- 422 sem eco (t69r S1)
def test_422_de_email_invalido_nao_ecoa_o_valor(fab):
    valor = "reconhecivel-sem-arroba-Zq7"
    r = fab.cliente().post("/api/cadastro", json=_cadastro(email=valor))
    assert r.status_code == 422
    assert valor not in r.text
    assert "email" in r.json()["erro"]["campos"]


def test_422_de_email_acima_de_254_nao_ecoa_o_valor(fab):
    # E-mail acima de 254 é barrado já pelo EmailStr (caminho `ctx.reason`); o caminho
    # `ctx.error` (ValueError do validador do modelo) é coberto pelo teste de perfil vazio.
    valor = "z" * 250 + "@example.com"
    r = fab.cliente().post("/api/sessao", json={"email": valor, "senha": SENHA_PADRAO})
    assert r.status_code == 422
    assert valor not in r.text
    assert "z" * 20 not in r.text
    assert r.json()["erro"]["campos"]["email"] == "Informe um e-mail válido, como nome@exemplo.com."


def test_422_de_perfil_sem_campos_usa_mensagem_fixa(fab):
    p = fab.uma_pessoa()
    r = p.cliente.patch("/api/perfil", json={})
    assert r.status_code == 422
    assert r.json()["erro"]["campos"]["corpo"] == "Informe nome ou tema."


def test_422_de_tema_invalido_nao_ecoa_o_valor_nem_lista_opcoes(fab):
    p = fab.uma_pessoa()
    r = p.cliente.patch("/api/perfil", json={"tema": "roxo-reconhecivel"})
    assert r.status_code == 422
    assert "roxo-reconhecivel" not in r.text
    assert "claro" not in r.text


def test_422_de_nome_longo_nao_ecoa_o_valor(fab):
    nome = "Reconhecivel" * 10
    r = fab.cliente().post("/api/cadastro", json=_cadastro(nome=nome))
    assert r.status_code == 422
    assert nome not in r.text


# -------------------------------------------------------------------- cookie
def _set_cookie_sid(resposta) -> str:
    cookies = [v for k, v in resposta.headers.multi_items() if k.lower() == "set-cookie"]
    sid = [c for c in cookies if c.startswith("sid=")]
    assert len(sid) == 1
    return sid[0].lower()


def test_cookie_sid_e_httponly_e_samesite_lax(fab):
    r = fab.cliente().post("/api/cadastro", json=_cadastro())
    cookie = _set_cookie_sid(r)
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert "path=/" in cookie
    assert "max-age=" in cookie


def test_cookie_do_login_tambem_e_httponly_e_samesite(fab):
    p = fab.uma_pessoa()
    r = fab.cliente().post("/api/sessao", json={"email": p.email, "senha": p.senha})
    cookie = _set_cookie_sid(r)
    assert "httponly" in cookie
    assert "samesite=lax" in cookie


def test_token_do_cookie_nao_aparece_no_corpo(fab):
    c = fab.cliente()
    r = c.post("/api/cadastro", json=_cadastro())
    assert c.cookies.get("sid") not in r.text


@pytest.mark.parametrize(("app_env", "secure"), [("prod", True), ("dev", False)])
def test_cookie_secure_segue_app_env(fab, monkeypatch, app_env, secure):
    cfg = Settings(
        DATABASE_URL="mysql+pymysql://u:p@localhost/x_test",
        APP_ENV=app_env,
        COOKIE_SECURE=None,
        _env_file=None,
    )
    monkeypatch.setattr(router_sessao, "get_settings", lambda: cfg)
    r = fab.cliente().post("/api/cadastro", json=_cadastro())
    cookie = _set_cookie_sid(r)
    assert ("secure" in cookie.split("; ")) is secure


def test_cookie_secure_explicito_sobrepoe_app_env(fab, monkeypatch):
    cfg = Settings(
        DATABASE_URL="mysql+pymysql://u:p@localhost/x_test",
        APP_ENV="prod",
        COOKIE_SECURE=False,
        _env_file=None,
    )
    monkeypatch.setattr(router_sessao, "get_settings", lambda: cfg)
    cookie = _set_cookie_sid(fab.cliente().post("/api/cadastro", json=_cadastro()))
    assert "secure" not in cookie.split("; ")


# -------------------------------------------------------------------- Origin
@pytest.mark.parametrize(
    ("metodo", "caminho", "corpo"),
    [
        ("POST", "/api/cadastro", _cadastro()),
        ("POST", "/api/sessao", {"email": "a@example.com", "senha": "x"}),
        ("DELETE", "/api/sessao", None),
        ("PATCH", "/api/perfil", {"tema": "escuro"}),
        ("POST", "/api/perfil/senha", {"senha_atual": "x", "senha_nova": "12345678"}),
    ],
)
def test_origin_fora_da_lista_da_403_em_escritas(fab, metodo, caminho, corpo):
    r = fab.cliente().request(
        metodo, caminho, json=corpo, headers={"Origin": "https://malicioso.example"}
    )
    assert r.status_code == 403
    assert r.json()["erro"]["codigo"] == "ORIGEM_INVALIDA"


def test_origin_invalido_nao_cria_o_usuario(fab):
    c = fab.cliente()
    r = c.post("/api/cadastro", json=_cadastro(), headers={"Origin": "https://malicioso.example"})
    assert r.status_code == 403
    r = fab.cliente().post("/api/sessao", json={"email": "ana@example.com", "senha": SENHA_RECONHECIVEL})
    assert r.status_code == 401


def test_origin_fora_da_lista_nao_bloqueia_leitura(fab):
    p = fab.uma_pessoa()
    r = p.cliente.get("/api/sessao", headers={"Origin": "https://malicioso.example"})
    assert r.status_code == 200


def test_origin_ausente_e_aceito(fab):
    c = fab.cliente()
    del c.headers["Origin"]
    assert c.post("/api/cadastro", json=_cadastro()).status_code == 201


def test_origin_permitido_e_aceito(fab):
    assert fab.cliente().post("/api/cadastro", json=_cadastro()).status_code == 201
