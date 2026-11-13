"""Fatia 1: cadastro, login, logout, sessão, perfil, tema e senha pela API, com banco real."""
import pytest
from fabricas import SENHA_PADRAO
from sqlalchemy import text

DADOS = {
    "nome": "Ana",
    "email": "ana@example.com",
    "senha": SENHA_PADRAO,
    "senha_confirmacao": SENHA_PADRAO,
}


def _contar_sessoes(sessao_direta, usuario_id: int) -> int:
    s = sessao_direta()
    return s.execute(
        text("SELECT COUNT(*) FROM sessao WHERE usuario_id = :u"), {"u": usuario_id}
    ).scalar_one()


# ------------------------------------------------------------------ CA-1.01
def test_cadastro_valido_cria_usuario_e_permite_login(fab):
    c = fab.cliente()
    r = c.post("/api/cadastro", json=DADOS)
    assert r.status_code == 201
    assert r.json()["usuario"]["email"] == "ana@example.com"
    assert r.json()["usuario"]["tema"] == "claro"
    assert r.json()["casal"] is None
    novo = fab.cliente()
    r = novo.post("/api/sessao", json={"email": "ana@example.com", "senha": SENHA_PADRAO})
    assert r.status_code == 200
    assert r.json()["usuario"]["nome"] == "Ana"


def test_cadastro_com_confirmacao_diferente_e_bloqueado(fab):
    c = fab.cliente()
    r = c.post("/api/cadastro", json={**DADOS, "senha_confirmacao": "outra-senha-123"})
    assert r.status_code == 422
    assert r.json()["erro"]["codigo"] == "VALIDACAO"
    assert "senha_confirmacao" in r.json()["erro"]["campos"]
    r = c.post("/api/sessao", json={"email": "ana@example.com", "senha": SENHA_PADRAO})
    assert r.status_code == 401


def test_cadastro_cria_conta_individual_com_nome_cortado_em_60(fab):
    nome = "N" * 80
    p = fab.uma_pessoa(nome)
    r = p.cliente.get("/api/contas")
    assert r.status_code == 200
    contas = r.json()["contas"]
    assert len(contas) == 1
    assert contas[0]["nome"] == ("Conta de " + nome)[:60]
    assert len(contas[0]["nome"]) == 60


# ------------------------------------------------------------------ CA-1.02
def test_email_repetido_com_caixa_diferente_e_recusado_e_primeiro_fica_intacto(fab):
    assert fab.cliente().post("/api/cadastro", json=DADOS).status_code == 201
    r = fab.cliente().post(
        "/api/cadastro", json={**DADOS, "nome": "Outra", "email": "ANA@Example.COM"}
    )
    assert r.status_code == 409
    assert r.json()["erro"]["codigo"] == "EMAIL_JA_CADASTRADO"
    r = fab.cliente().post("/api/sessao", json={"email": "ana@example.com", "senha": SENHA_PADRAO})
    assert r.status_code == 200
    assert r.json()["usuario"]["nome"] == "Ana"


# ------------------------------------------------------------------ CA-1.03
def test_senha_de_7_caracteres_e_recusada(fab):
    r = fab.cliente().post(
        "/api/cadastro", json={**DADOS, "senha": "1234567", "senha_confirmacao": "1234567"}
    )
    assert r.status_code == 422
    assert "senha" in r.json()["erro"]["campos"]


def test_senha_de_8_caracteres_e_aceita(fab):
    r = fab.cliente().post(
        "/api/cadastro", json={**DADOS, "senha": "12345678", "senha_confirmacao": "12345678"}
    )
    assert r.status_code == 201


# ------------------------------------------------------------------ CA-1.04
def test_login_correto_devolve_sessao_e_cookie(fab):
    p = fab.uma_pessoa()
    c = fab.cliente()
    r = c.post("/api/sessao", json={"email": p.email, "senha": p.senha})
    assert r.status_code == 200
    assert r.json()["usuario"]["id"] == p.id
    assert c.get("/api/sessao").status_code == 200


def test_login_aceita_email_com_caixa_diferente(fab):
    p = fab.uma_pessoa()
    r = fab.cliente().post("/api/sessao", json={"email": p.email.upper(), "senha": p.senha})
    assert r.status_code == 200


def test_senha_errada_e_email_inexistente_dao_a_mesma_resposta(fab):
    p = fab.uma_pessoa()
    errada = fab.cliente().post("/api/sessao", json={"email": p.email, "senha": "senha-errada-1"})
    inexistente = fab.cliente().post(
        "/api/sessao", json={"email": "ninguem@example.com", "senha": "senha-errada-1"}
    )
    assert errada.status_code == inexistente.status_code == 401
    assert errada.json() == inexistente.json()
    assert errada.json()["erro"]["codigo"] == "CREDENCIAIS_INVALIDAS"
    assert "set-cookie" not in errada.headers


def test_login_com_senha_acima_de_128_responde_como_senha_errada(fab):
    p = fab.uma_pessoa()
    r = fab.cliente().post("/api/sessao", json={"email": p.email, "senha": "x" * 200})
    assert r.status_code == 401
    assert r.json()["erro"]["codigo"] == "CREDENCIAIS_INVALIDAS"


# ------------------------------------------------------------------ CA-1.05
def test_logout_invalida_o_token_no_banco_e_nega_acesso(fab, sessao_direta):
    p = fab.uma_pessoa()
    token = p.cliente.cookies.get("sid")
    assert _contar_sessoes(sessao_direta, p.id) == 1
    r = p.cliente.delete("/api/sessao")
    assert r.status_code == 204
    assert _contar_sessoes(sessao_direta, p.id) == 0
    # Reenvia o token antigo à mão: o servidor já não o reconhece.
    antigo = fab.cliente()
    r = antigo.get("/api/sessao", headers={"Cookie": f"sid={token}"})
    assert r.status_code == 401
    assert r.json()["erro"]["codigo"] == "NAO_AUTENTICADO"
    assert p.cliente.get("/api/contas").status_code == 401


def test_logout_expira_o_cookie_na_resposta(fab):
    p = fab.uma_pessoa()
    r = p.cliente.delete("/api/sessao")
    set_cookie = r.headers["set-cookie"].lower()
    assert "sid=" in set_cookie
    assert "max-age=0" in set_cookie or "expires=" in set_cookie


def test_logout_nao_derruba_a_sessao_de_outro_aparelho(fab):
    p = fab.uma_pessoa()
    outro = fab.entrar(p)
    assert p.cliente.delete("/api/sessao").status_code == 204
    assert outro.get("/api/sessao").status_code == 200


# ------------------------------------------------------------------ CA-1.11
def test_alterar_nome_reflete_na_sessao_da_outra_pessoa(fab):
    casal = fab.um_casal("Ana", "Beto")
    r = casal.a.cliente.patch("/api/perfil", json={"nome": "  Ana Maria  "})
    assert r.status_code == 200
    assert r.json()["nome"] == "Ana Maria"
    r = casal.b.cliente.get("/api/sessao")
    assert r.json()["casal"]["parceiro"]["nome"] == "Ana Maria"


def test_perfil_sem_campos_e_recusado(fab):
    p = fab.uma_pessoa()
    r = p.cliente.patch("/api/perfil", json={})
    assert r.status_code == 422


def test_perfil_com_nome_vazio_ou_acima_de_80_e_recusado(fab):
    p = fab.uma_pessoa()
    assert p.cliente.patch("/api/perfil", json={"nome": "   "}).status_code == 422
    assert p.cliente.patch("/api/perfil", json={"nome": "a" * 81}).status_code == 422
    assert p.cliente.patch("/api/perfil", json={"nome": "a" * 80}).status_code == 200


# ------------------------------------------------------------- CA-1.12 / CA-0.09
def test_tema_escuro_persiste_apos_sair_e_entrar(fab):
    p = fab.uma_pessoa()
    r = p.cliente.patch("/api/perfil", json={"tema": "escuro"})
    assert r.status_code == 200
    assert r.json()["tema"] == "escuro"
    assert p.cliente.delete("/api/sessao").status_code == 204
    novo = fab.entrar(p)
    assert novo.get("/api/sessao").json()["usuario"]["tema"] == "escuro"


def test_tema_de_uma_pessoa_nao_altera_o_da_outra(fab):
    casal = fab.um_casal()
    casal.a.cliente.patch("/api/perfil", json={"tema": "escuro"})
    assert casal.b.cliente.get("/api/sessao").json()["usuario"]["tema"] == "claro"
    assert casal.a.cliente.get("/api/sessao").json()["usuario"]["tema"] == "escuro"


def test_tema_invalido_e_recusado(fab):
    p = fab.uma_pessoa()
    r = p.cliente.patch("/api/perfil", json={"tema": "azul"})
    assert r.status_code == 422
    assert "azul" not in r.text


def test_tema_fica_salvo_no_servidor_e_nao_no_cliente(fab, sessao_direta):
    p = fab.uma_pessoa()
    p.cliente.patch("/api/perfil", json={"tema": "escuro"})
    s = sessao_direta()
    tema = s.execute(text("SELECT tema FROM usuario WHERE id = :i"), {"i": p.id}).scalar_one()
    assert tema == "escuro"


# ------------------------------------------------------------------ CA-1.13
def test_alterar_senha_permite_nova_e_recusa_antiga(fab):
    p = fab.uma_pessoa()
    r = p.cliente.post(
        "/api/perfil/senha", json={"senha_atual": p.senha, "senha_nova": "nova-senha-456"}
    )
    assert r.status_code == 204
    assert fab.cliente().post(
        "/api/sessao", json={"email": p.email, "senha": p.senha}
    ).status_code == 401
    assert fab.cliente().post(
        "/api/sessao", json={"email": p.email, "senha": "nova-senha-456"}
    ).status_code == 200


def test_senha_atual_errada_bloqueia_a_alteracao(fab):
    p = fab.uma_pessoa()
    r = p.cliente.post(
        "/api/perfil/senha", json={"senha_atual": "errada-errada", "senha_nova": "nova-senha-456"}
    )
    assert r.status_code == 409
    assert r.json()["erro"]["codigo"] == "SENHA_ATUAL_INCORRETA"
    assert fab.cliente().post(
        "/api/sessao", json={"email": p.email, "senha": p.senha}
    ).status_code == 200
    assert fab.cliente().post(
        "/api/sessao", json={"email": p.email, "senha": "nova-senha-456"}
    ).status_code == 401


def test_senha_nova_curta_e_recusada(fab):
    p = fab.uma_pessoa()
    r = p.cliente.post(
        "/api/perfil/senha", json={"senha_atual": p.senha, "senha_nova": "1234567"}
    )
    assert r.status_code == 422


def test_alterar_senha_mantem_a_sessao_atual_e_derruba_as_outras(fab):
    p = fab.uma_pessoa()
    outro = fab.entrar(p)
    r = p.cliente.post(
        "/api/perfil/senha", json={"senha_atual": p.senha, "senha_nova": "nova-senha-456"}
    )
    assert r.status_code == 204
    assert p.cliente.get("/api/sessao").status_code == 200
    assert outro.get("/api/sessao").status_code == 401


# ------------------------------------------------------------------ CA-N.04
@pytest.mark.parametrize(
    ("metodo", "caminho", "corpo"),
    [
        ("GET", "/api/sessao", None),
        ("DELETE", "/api/sessao", None),
        ("PATCH", "/api/perfil", {"tema": "escuro"}),
        ("POST", "/api/perfil/senha", {"senha_atual": "x", "senha_nova": "12345678"}),
    ],
)
def test_rotas_da_fatia_sem_sessao_dao_401(fab, metodo, caminho, corpo):
    r = fab.cliente().request(metodo, caminho, json=corpo)
    assert r.status_code == 401
    assert r.json()["erro"]["codigo"] == "NAO_AUTENTICADO"


def test_token_inexistente_no_cookie_da_401(fab):
    r = fab.cliente().get("/api/sessao", headers={"Cookie": "sid=token-que-nao-existe"})
    assert r.status_code == 401
    assert r.json()["erro"]["codigo"] == "NAO_AUTENTICADO"
