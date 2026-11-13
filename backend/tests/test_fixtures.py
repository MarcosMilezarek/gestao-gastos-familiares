"""Fumaça da base de testes com banco real (conftest.py + fabricas.py)."""
from datetime import date

import pytest
from sqlalchemy import text

pytestmark = pytest.mark.usefixtures("banco")


def _contar(sessao, tabela: str) -> int:
    return sessao.execute(text(f"SELECT COUNT(*) FROM `{tabela}`")).scalar()


def test_banco_comeca_vazio_sem_residuo_de_teste_anterior(sessao_direta):
    s = sessao_direta()
    assert _contar(s, "usuario") == 0
    assert _contar(s, "casal") == 0


def test_cadastra_loga_e_vincula_um_casal(fab):
    casal = fab.um_casal()
    cliente_logado = fab.entrar(casal.a)
    r = cliente_logado.get("/api/sessao")
    assert r.status_code == 200
    assert r.json()["usuario"]["id"] == casal.a.id
    assert r.json()["casal"]["id"] == casal.id
    assert r.json()["casal"]["parceiro"]["id"] == casal.b.id
    assert casal.b.cliente.get("/api/sessao").json()["casal"]["id"] == casal.id


def test_pessoa_sem_vinculo_nao_tem_casal(fab):
    p = fab.uma_pessoa()
    assert p.cliente.get("/api/sessao").json()["casal"] is None


def test_sem_cookie_a_rota_protegida_responde_401(fab):
    assert fab.cliente().get("/api/contas").status_code == 401


def test_pessoa_do_casal_1_nao_le_recurso_do_casal_2(fab):
    c1, c2 = fab.dois_casais()
    assert c1.id != c2.id
    contas_c2 = c2.a.cliente.get("/api/contas").json()["contas"]
    assert contas_c2, "casal 2 deveria ter ao menos uma conta pelo vínculo"
    ids_c1 = {c["id"] for c in c1.a.cliente.get("/api/contas").json()["contas"]}
    id_c2 = contas_c2[0]["id"]
    assert id_c2 not in ids_c1
    assert c2.a.cliente.get(f"/api/contas/{id_c2}").status_code == 200
    assert c1.a.cliente.get(f"/api/contas/{id_c2}").status_code == 404
    assert c1.b.cliente.get(f"/api/contas/{id_c2}").status_code == 404


def test_sessao_direta_usa_conexao_separada_e_enxerga_dados_commitados(fab, sessao_direta):
    fab.um_casal()
    s1, s2 = sessao_direta(), sessao_direta()
    id1 = s1.execute(text("SELECT CONNECTION_ID()")).scalar()
    id2 = s2.execute(text("SELECT CONNECTION_ID()")).scalar()
    assert id1 != id2
    assert _contar(s2, "usuario") == 2
    assert _contar(s2, "casal") == 1


def test_relogio_fixa_hoje_na_rota(fab, relogio):
    relogio(date(2030, 2, 28))
    p = fab.uma_pessoa()
    assert p.cliente.get("/api/sessao").json()["hoje"] == "2030-02-28"


def test_origem_nao_permitida_e_recusada_pelo_cliente_da_fabrica(fab):
    p = fab.uma_pessoa()
    r = p.cliente.post("/api/convites", json={"email": "x@y.com"}, headers={"Origin": "http://mal.example"})
    assert r.status_code == 403
