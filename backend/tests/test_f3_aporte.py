"""Fatia 3: aportado, faltante, excedente e sugestão de aporte (CA-3.17 a CA-3.20; docs/revisoes/t127.md)."""
import json
from datetime import date
from decimal import Decimal

import pytest

HOJE = date(2026, 8, 5)


def _categoria(cliente, nome: str, tipo: str = "despesa") -> int:
    r = cliente.get("/api/categorias", params={"tipo": tipo})
    assert r.status_code == 200, r.text
    for raiz in r.json():
        for no in [raiz, *raiz["subcategorias"]]:
            if no["nome"] == nome:
                return no["id"]
    raise AssertionError(nome)


def _individual(cliente, dono_id) -> int:
    contas = cliente.get("/api/contas").json()["contas"]
    return next(c["id"] for c in contas if c["dono_usuario_id"] == dono_id)


def _conjunta(cliente) -> int:
    contas = cliente.get("/api/contas").json()["contas"]
    return next(c["id"] for c in contas if c["dono_usuario_id"] is None)


def _despesa_casal(pessoa, valor, data, situacao="prevista"):
    r = pessoa.cliente.post("/api/lancamentos", json={
        "tipo": "despesa", "valor": valor, "data": data, "descricao": "teste",
        "categoria_id": _categoria(pessoa.cliente, "Mercado"), "dono_usuario_id": None,
        "conta_id": _conjunta(pessoa.cliente), "situacao": situacao})
    assert r.status_code == 201, r.text


def _salario(pessoa, valor, data):
    r = pessoa.cliente.post("/api/lancamentos", json={
        "tipo": "receita", "valor": valor, "data": data, "descricao": "teste",
        "categoria_id": _categoria(pessoa.cliente, "Salário", "receita"),
        "dono_usuario_id": pessoa.id, "conta_id": _individual(pessoa.cliente, pessoa.id),
        "situacao": "prevista"})
    assert r.status_code == 201, r.text


def _transferir(pessoa, origem, destino, valor, data, situacao="confirmada"):
    r = pessoa.cliente.post("/api/lancamentos", json={
        "tipo": "transferencia", "valor": valor, "data": data, "situacao": situacao,
        "conta_id": origem, "conta_destino_id": destino})
    assert r.status_code == 201, r.text


def _aporte(pessoa, valor, data="2026-10-15", situacao="confirmada"):
    _transferir(pessoa, _individual(pessoa.cliente, pessoa.id), _conjunta(pessoa.cliente),
                valor, data, situacao)


def _linha(cliente, mes, usuario_id):
    r = cliente.get("/api/proporcao", params={"mes": mes})
    assert r.status_code == 200, r.text
    return next(p for p in r.json()["pessoas"] if p["usuario_id"] == usuario_id)


def _sugestao(cliente, conta_id, data):
    return cliente.get("/api/proporcao/sugestao-aporte",
                       params={"conta_origem_id": conta_id, "data": data})


def _total_linhas(sessao_direta) -> int:
    from sqlalchemy import func, select

    from app.models.lancamento import Lancamento

    with sessao_direta() as db:
        return db.scalar(select(func.count()).select_from(Lancamento))


@pytest.fixture
def casal(fab, relogio):
    """60/40 em outubro/2026 com base de 2.500,00: devido de A 1.500,00 e de B 1.000,00."""
    relogio(HOJE)
    c = fab.um_casal("Ana", "Bia")
    _salario(c.a, "6000.00", "2026-10-05")
    _salario(c.b, "4000.00", "2026-10-05")
    _despesa_casal(c.a, "2500.00", "2026-10-10")
    return c


# ------------------------------------------------------------------ CA-3.17

def test_aporte_confirmado_de_1000_deixa_faltante_500(casal):
    _aporte(casal.a, "1000.00")
    linha = _linha(casal.a.cliente, "2026-10", casal.a.id)
    assert (linha["devido"], linha["aportado"], linha["faltante"], linha["excedente"]) == (
        "1500.00", "1000.00", "500.00", "0.00")


def test_aporte_apenas_previsto_nao_altera_o_aportado(casal):
    _aporte(casal.a, "1000.00")
    _aporte(casal.a, "600.00", situacao="prevista")
    linha = _linha(casal.a.cliente, "2026-10", casal.a.id)
    assert (linha["aportado"], linha["faltante"]) == ("1000.00", "500.00")


def test_aporte_total_de_1700_zera_o_faltante_e_gera_excedente_200(casal):
    _aporte(casal.a, "1000.00")
    _aporte(casal.a, "700.00", data="2026-10-20")
    linha = _linha(casal.a.cliente, "2026-10", casal.a.id)
    assert (linha["aportado"], linha["faltante"], linha["excedente"]) == ("1700.00", "0.00", "200.00")


def test_transferencia_entre_individuais_nao_conta_como_aportado(casal):
    _transferir(casal.a, _individual(casal.a.cliente, casal.a.id),
                _individual(casal.a.cliente, casal.b.id), "800.00", "2026-10-15")
    for pessoa in (casal.a, casal.b):
        linha = _linha(casal.a.cliente, "2026-10", pessoa.id)
        assert linha["aportado"] == "0.00"
    assert _linha(casal.a.cliente, "2026-10", casal.a.id)["faltante"] == "1500.00"


def test_aporte_de_cada_pessoa_e_contado_so_para_ela_e_no_mes_da_data(casal):
    _aporte(casal.b, "400.00")
    _aporte(casal.a, "300.00", data="2026-11-02")
    assert _linha(casal.a.cliente, "2026-10", casal.a.id)["aportado"] == "0.00"
    linha_b = _linha(casal.a.cliente, "2026-10", casal.b.id)
    assert (linha_b["aportado"], linha_b["faltante"]) == ("400.00", "600.00")
    assert _linha(casal.a.cliente, "2026-11", casal.a.id)["aportado"] == "300.00"


# ------------------------------------------------------------------ CA-3.18

def test_saldo_sobrando_da_conjunta_nao_reduz_o_devido(fab, relogio):
    relogio(HOJE)
    c = fab.um_casal()
    _salario(c.a, "6000.00", "2026-09-05")
    _salario(c.b, "4000.00", "2026-09-05")
    _aporte(c.a, "5000.00", data="2026-09-15")
    _despesa_casal(c.a, "1000.00", "2026-10-10")
    corpo = c.a.cliente.get("/api/proporcao", params={"mes": "2026-10"}).json()
    assert [p["devido"] for p in corpo["pessoas"]] == ["600.00", "400.00"]
    assert [p["faltante"] for p in corpo["pessoas"]] == ["600.00", "400.00"]


def test_excedente_do_mes_anterior_nao_reduz_devido_nem_faltante_do_seguinte(casal):
    _aporte(casal.a, "1700.00", data="2026-10-15")  # excedente 200,00 em outubro
    _salario(casal.a, "6000.00", "2026-11-05")
    _salario(casal.b, "4000.00", "2026-11-05")
    _despesa_casal(casal.a, "2500.00", "2026-11-10")
    assert _linha(casal.a.cliente, "2026-10", casal.a.id)["excedente"] == "200.00"
    nov = _linha(casal.a.cliente, "2026-11", casal.a.id)
    assert (nov["devido"], nov["faltante"], nov["excedente"]) == ("1500.00", "1500.00", "0.00")


# ------------------------------------------------------------------ CA-3.19

def test_sugestao_de_aporte_e_o_faltante_do_mes_da_data(casal):
    _aporte(casal.a, "1000.00")
    r = _sugestao(casal.a.cliente, _individual(casal.a.cliente, casal.a.id), "2026-10-29")
    assert r.status_code == 200, r.text
    assert r.json() == {"valor": "500.00"}
    # o valor sugerido pode ser trocado por 450,00: o aporte de 450,00 é aceito e reduz o faltante
    _aporte(casal.a, "450.00", data="2026-10-29")
    assert _linha(casal.a.cliente, "2026-10", casal.a.id)["faltante"] == "50.00"


def test_sugestao_e_de_quem_e_dona_da_conta_de_origem(casal):
    r = _sugestao(casal.b.cliente, _individual(casal.b.cliente, casal.b.id), "2026-10-29")
    assert r.json() == {"valor": "1000.00"}


def test_sugestao_sem_faltante_vem_vazia(casal):
    _aporte(casal.a, "1500.00")
    r = _sugestao(casal.a.cliente, _individual(casal.a.cliente, casal.a.id), "2026-10-29")
    assert r.status_code == 200 and r.json() == {"valor": None}


def test_sugestao_em_mes_sem_despesas_vem_vazia(casal):
    r = _sugestao(casal.a.cliente, _individual(casal.a.cliente, casal.a.id), "2026-12-01")
    assert r.status_code == 200 and r.json() == {"valor": None}


def test_sugestao_com_conta_de_origem_conjunta_vem_vazia(casal):
    r = _sugestao(casal.a.cliente, _conjunta(casal.a.cliente), "2026-10-29")
    assert r.status_code == 200 and r.json() == {"valor": None}


def test_sugestao_sem_casal_ativo_vem_vazia(fab, relogio):
    relogio(HOJE)
    p = fab.uma_pessoa()
    r = _sugestao(p.cliente, _individual(p.cliente, p.id), "2026-10-29")
    assert r.status_code == 200 and r.json() == {"valor": None}


def test_sugestao_com_conta_de_outro_casal_da_404(casal, fab):
    outro = fab.um_casal()
    r = _sugestao(casal.a.cliente, _individual(outro.a.cliente, outro.a.id), "2026-10-29")
    assert r.status_code == 404, r.text


@pytest.mark.parametrize("data", ["1999-12-31", "2036-09-01", "2099-12-31", "9999-12-31"])
def test_sugestao_com_data_fora_do_intervalo_da_422_sem_gerar_ocorrencias(casal, sessao_direta, data):
    conta = _individual(casal.a.cliente, casal.a.id)
    r = casal.a.cliente.post("/api/lancamentos", json={
        "tipo": "despesa", "valor": "10.00", "data": "2026-08-01", "descricao": "fixa",
        "categoria_id": _categoria(casal.a.cliente, "Mercado"), "dono_usuario_id": casal.a.id,
        "conta_id": conta, "recorrencia": {"modo": "sem_fim"}})
    assert r.status_code == 201, r.text
    antes = _total_linhas(sessao_direta)
    resp = _sugestao(casal.a.cliente, conta, data)
    assert resp.status_code == 422, resp.text
    assert "data" in resp.json()["erro"]["campos"]
    assert _total_linhas(sessao_direta) == antes  # nada foi gerado pela chamada recusada


def test_sugestao_aceita_as_bordas_do_intervalo(casal):
    conta = _individual(casal.a.cliente, casal.a.id)
    assert _sugestao(casal.a.cliente, conta, "2000-01-01").status_code == 200
    assert _sugestao(casal.a.cliente, conta, "2036-08-05").status_code == 200


# ------------------------------------------------------------------ CA-3.20

def test_tela_mostra_os_valores_das_duas_pessoas_e_trocar_o_mes_muda_os_valores(casal):
    _aporte(casal.a, "1000.00")
    _salario(casal.a, "1000.00", "2026-11-05")
    _salario(casal.b, "1000.00", "2026-11-05")
    _despesa_casal(casal.a, "1000.00", "2026-11-10")
    out = casal.b.cliente.get("/api/proporcao", params={"mes": "2026-10"}).json()
    nov = casal.b.cliente.get("/api/proporcao", params={"mes": "2026-11"}).json()
    assert out["base_despesas_casal"] == "2500.00" and nov["base_despesas_casal"] == "1000.00"
    assert [(p["porcentagem"], p["devido"], p["aportado"], p["faltante"], p["excedente"])
            for p in out["pessoas"]] == [
        ("60.00", "1500.00", "1000.00", "500.00", "0.00"),
        ("40.00", "1000.00", "0.00", "1000.00", "0.00")]
    assert [(p["porcentagem"], p["devido"], p["aportado"]) for p in nov["pessoas"]] == [
        ("50.00", "500.00", "0.00"), ("50.00", "500.00", "0.00")]


def test_json_do_aporte_e_da_sugestao_sem_float(casal):
    _aporte(casal.a, "1000.00")

    def sem_float(texto):
        raise AssertionError(f"número JSON não textual: {texto}")

    for r in (casal.a.cliente.get("/api/proporcao", params={"mes": "2026-10"}),
              _sugestao(casal.a.cliente, _individual(casal.a.cliente, casal.a.id), "2026-10-29")):
        json.loads(r.text, parse_float=sem_float)
    assert Decimal(_sugestao(casal.a.cliente, _individual(casal.a.cliente, casal.a.id),
                             "2026-10-29").json()["valor"]) == Decimal("500.00")
