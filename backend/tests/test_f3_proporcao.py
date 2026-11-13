"""Fatia 3: porcentagem do mês, base e devido (CA-3.10 a CA-3.16; D-021, D-038; roteiro de docs/revisoes/t127.md)."""
import json
from datetime import date
from decimal import Decimal

import pytest

from app.services.proporcao import percentual, rateio

HOJE = date(2026, 8, 5)


def _categoria(cliente, nome: str, tipo: str) -> int:
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


def _lancar(pessoa, conta, tipo, valor, data, categoria, dono="pessoa", situacao=None, **extra):
    corpo = {
        "tipo": tipo, "valor": valor, "data": data, "descricao": "teste",
        "categoria_id": _categoria(pessoa.cliente, categoria, tipo),
        "dono_usuario_id": pessoa.id if dono == "pessoa" else None,
        "conta_id": conta,
    }
    if situacao:
        corpo["situacao"] = situacao
    corpo.update(extra)
    r = pessoa.cliente.post("/api/lancamentos", json=corpo)
    assert r.status_code == 201, r.text
    return r.json()


def _salario(pessoa, valor, data, categoria="Salário", **extra):
    return _lancar(pessoa, _individual(pessoa.cliente, pessoa.id), "receita", valor, data,
                   categoria, situacao=extra.pop("situacao", "prevista"), **extra)


def _despesa_casal(pessoa, conta_conjunta, valor, data, situacao="prevista"):
    return _lancar(pessoa, conta_conjunta, "despesa", valor, data, "Mercado", dono="casal",
                   situacao=situacao)


def _proporcao(cliente, mes):
    r = cliente.get("/api/proporcao", params={"mes": mes})
    assert r.status_code == 200, r.text
    return r.json()


def _pcts(corpo):
    return [p["porcentagem"] for p in corpo["pessoas"]]


def _devidos(corpo):
    return [p["devido"] for p in corpo["pessoas"]]


@pytest.fixture
def casal(fab, relogio):
    relogio(HOJE)
    return fab.um_casal("Ana", "Bia")


# ------------------------------------------------------------------ CA-3.10

def test_salarios_previstos_6000_e_4000_dao_60_e_40(casal):
    _salario(casal.a, "6000.00", "2026-10-05")
    _salario(casal.b, "4000.00", "2026-10-05")
    corpo = _proporcao(casal.a.cliente, "2026-10")
    assert _pcts(corpo) == ["60.00", "40.00"]
    assert corpo["origem_porcentagem"] == "mes" and corpo["mes_origem"] is None
    assert [p["usuario_id"] for p in corpo["pessoas"]] == [casal.a.id, casal.b.id]


def test_confirmar_o_salario_de_a_com_6500_muda_para_61_90_e_38_10_na_releitura(casal):
    prevista = _salario(casal.a, "6000.00", "2026-10-05")
    _salario(casal.b, "4000.00", "2026-10-05")
    assert _pcts(_proporcao(casal.a.cliente, "2026-10")) == ["60.00", "40.00"]
    r = casal.a.cliente.post(f"/api/lancamentos/{prevista['id']}/confirmar", json={"valor": "6500.00"})
    assert r.status_code == 200, r.text
    for pessoa in (casal.a, casal.b):
        assert _pcts(_proporcao(pessoa.cliente, "2026-10")) == ["61.90", "38.10"]


# ------------------------------------------------------------------ CA-3.11

def test_duas_receitas_de_salario_de_a_somam_na_porcentagem(casal):
    _salario(casal.a, "5000.00", "2026-10-05")
    _salario(casal.a, "1000.00", "2026-10-20", categoria="Horas extras")
    _salario(casal.b, "4000.00", "2026-10-05")
    assert _pcts(_proporcao(casal.a.cliente, "2026-10")) == ["60.00", "40.00"]


def test_receita_de_salario_com_dono_casal_nao_entra_na_porcentagem(casal):
    _salario(casal.a, "6000.00", "2026-10-05")
    _salario(casal.b, "4000.00", "2026-10-05")
    _lancar(casal.a, _conjunta(casal.a.cliente), "receita", "9000.00", "2026-10-06", "Salário",
            dono="casal", situacao="prevista")
    assert _pcts(_proporcao(casal.a.cliente, "2026-10")) == ["60.00", "40.00"]


# ------------------------------------------------------------------ CA-3.12

def test_editar_salario_de_fevereiro_em_diante_nao_altera_janeiro_e_confirmar_fevereiro_nao_altera_marco(casal):
    corpo = {"recorrencia": {"modo": "sem_fim"}}
    sal_a = _salario(casal.a, "6000.00", "2026-01-05", **corpo)
    _salario(casal.b, "4000.00", "2026-01-05", **corpo)
    for mes in ("2026-01", "2026-02", "2026-03"):
        assert _pcts(_proporcao(casal.a.cliente, mes)) == ["60.00", "40.00"]
    fev = next(x for x in casal.a.cliente.get("/api/lancamentos", params={"mes": "2026-02"}).json()
               if x["recorrencia_id"] == sal_a["recorrencia_id"])
    r = casal.a.cliente.patch(f"/api/lancamentos/{fev['id']}", params={"alcance": "este_e_pendentes"},
                              json={"valor": "7000.00"})
    assert r.status_code == 200, r.text
    assert _pcts(_proporcao(casal.a.cliente, "2026-01")) == ["60.00", "40.00"]
    assert _pcts(_proporcao(casal.a.cliente, "2026-02")) == ["63.64", "36.36"]
    assert _pcts(_proporcao(casal.a.cliente, "2026-03")) == ["63.64", "36.36"]
    # confirmar o valor real de fevereiro (7500) não altera março
    r = casal.a.cliente.post(f"/api/lancamentos/{fev['id']}/confirmar", json={"valor": "7500.00"})
    assert r.status_code == 200, r.text
    assert _pcts(_proporcao(casal.a.cliente, "2026-02")) == ["65.22", "34.78"]
    assert _pcts(_proporcao(casal.a.cliente, "2026-03")) == ["63.64", "36.36"]


# ------------------------------------------------------------------ CA-3.13

def test_receita_venda_fora_de_salario_nao_altera_porcentagem_nem_devido_e_entra_no_saldo(casal):
    conjunta = _conjunta(casal.a.cliente)
    _salario(casal.a, "6000.00", "2026-10-05")
    _salario(casal.b, "4000.00", "2026-10-05")
    _despesa_casal(casal.a, conjunta, "2500.00", "2026-10-10")
    antes = _proporcao(casal.a.cliente, "2026-10")
    conta_a = _individual(casal.a.cliente, casal.a.id)
    saldo_antes = Decimal(casal.a.cliente.get(f"/api/contas/{conta_a}").json()["saldo_atual"])
    r = casal.a.cliente.post("/api/categorias", json={"tipo": "receita", "nome": "Venda", "icone": "house", "cor": "#2E7D32"})
    assert r.status_code == 201, r.text
    _lancar(casal.a, conta_a, "receita", "800.00", "2026-08-01", "Venda")
    saldo_depois = Decimal(casal.a.cliente.get(f"/api/contas/{conta_a}").json()["saldo_atual"])
    assert saldo_depois - saldo_antes == Decimal("800.00")
    assert _proporcao(casal.a.cliente, "2026-10") == antes
    assert _proporcao(casal.a.cliente, "2026-08")["pessoas"][0]["devido"] == "0.00"


# ------------------------------------------------------------------ CA-3.14

def test_mes_sem_salario_herda_do_anterior_e_calcula_devido_600_e_400(casal):
    _salario(casal.a, "6000.00", "2026-01-05")
    _salario(casal.b, "4000.00", "2026-01-05")
    _despesa_casal(casal.a, _conjunta(casal.a.cliente), "1000.00", "2026-02-10")
    corpo = _proporcao(casal.a.cliente, "2026-02")
    assert _pcts(corpo) == ["60.00", "40.00"]
    assert corpo["origem_porcentagem"] == "herdada" and corpo["mes_origem"] == "2026-01"
    assert corpo["base_despesas_casal"] == "1000.00"
    assert _devidos(corpo) == ["600.00", "400.00"]


def test_marco_sem_salario_herda_de_janeiro_via_fevereiro_e_salario_de_fevereiro_muda_marco(casal):
    _salario(casal.a, "6000.00", "2026-01-05")
    _salario(casal.b, "4000.00", "2026-01-05")
    marco = _proporcao(casal.a.cliente, "2026-03")
    assert _pcts(marco) == ["60.00", "40.00"]
    assert marco["origem_porcentagem"] == "herdada" and marco["mes_origem"] == "2026-01"
    _salario(casal.a, "3000.00", "2026-02-05")
    _salario(casal.b, "7000.00", "2026-02-05")
    assert _pcts(_proporcao(casal.a.cliente, "2026-02")) == ["30.00", "70.00"]
    marco = _proporcao(casal.a.cliente, "2026-03")
    assert _pcts(marco) == ["30.00", "70.00"] and marco["mes_origem"] == "2026-02"


def test_nunca_houve_salario_da_50_50_e_devido_500_para_cada(casal):
    _despesa_casal(casal.a, _conjunta(casal.a.cliente), "1000.00", "2026-02-10")
    corpo = _proporcao(casal.a.cliente, "2026-02")
    assert _pcts(corpo) == ["50.00", "50.00"]
    assert corpo["origem_porcentagem"] == "padrao_50_50" and corpo["mes_origem"] is None
    assert _devidos(corpo) == ["500.00", "500.00"]


def test_mes_futuro_sem_historico_tambem_da_50_50(casal):
    corpo = _proporcao(casal.a.cliente, "2026-12")
    assert _pcts(corpo) == ["50.00", "50.00"] and corpo["base_despesas_casal"] == "0.00"
    assert _devidos(corpo) == ["0.00", "0.00"]


# ------------------------------------------------------------------ CA-3.15

def test_base_soma_prevista_confirmada_e_atrasada_do_casal_e_ignora_o_resto(casal):
    conjunta = _conjunta(casal.a.cliente)
    ind_a = _individual(casal.a.cliente, casal.a.id)
    ind_b = _individual(casal.a.cliente, casal.b.id)
    _despesa_casal(casal.a, conjunta, "1000.00", "2026-10-10", "prevista")
    _despesa_casal(casal.a, conjunta, "1200.00", "2026-10-11", "confirmada")
    _despesa_casal(casal.a, conjunta, "300.00", "2026-08-01", "prevista")  # vencida
    _despesa_casal(casal.a, conjunta, "300.00", "2026-10-12", "prevista")
    # (as duas últimas: uma atrasada fora do mês, uma no mês; só a do mês conta)
    assert _proporcao(casal.a.cliente, "2026-10")["base_despesas_casal"] == "2500.00"
    _lancar(casal.a, ind_a, "despesa", "400.00", "2026-10-13", "Mercado", situacao="prevista")
    _lancar(casal.a, ind_a, "receita", "999.00", "2026-10-14", "Salário", situacao="prevista")
    r = casal.a.cliente.post(f"/api/contas/{ind_a}/reajuste", json={"saldo_real": "123.45"})
    assert r.status_code == 200, r.text
    r = casal.a.cliente.post("/api/lancamentos", json={
        "tipo": "transferencia", "valor": "50.00", "data": "2026-10-15", "situacao": "prevista",
        "conta_id": ind_a, "conta_destino_id": ind_b})
    assert r.status_code == 201, r.text
    assert _proporcao(casal.a.cliente, "2026-10")["base_despesas_casal"] == "2500.00"


def test_base_conta_despesa_atrasada_do_proprio_mes(casal):
    conjunta = _conjunta(casal.a.cliente)
    _despesa_casal(casal.a, conjunta, "300.00", "2026-08-01", "prevista")  # hoje 05/08: atrasada
    assert _proporcao(casal.a.cliente, "2026-08")["base_despesas_casal"] == "300.00"


# ------------------------------------------------------------------ CA-3.16

def _com_base_e_salarios(casal, base, sal_a, sal_b):
    if sal_a is not None:
        _salario(casal.a, sal_a, "2026-10-05")
        _salario(casal.b, sal_b, "2026-10-05")
    _despesa_casal(casal.a, _conjunta(casal.a.cliente), base, "2026-10-10")
    return _proporcao(casal.a.cliente, "2026-10")


@pytest.mark.parametrize("base,sal_a,sal_b,pcts,devidos", [
    ("2500.00", "6000.00", "4000.00", ["60.00", "40.00"], ["1500.00", "1000.00"]),
    ("2500.00", "6500.00", "4000.00", ["61.90", "38.10"], ["1547.62", "952.38"]),
    ("100.01", "6000.00", "4000.00", ["60.00", "40.00"], ["60.01", "40.00"]),
    ("100.01", None, None, ["50.00", "50.00"], ["50.01", "50.00"]),
])
def test_devido_rateado_com_soma_exata_da_base(casal, base, sal_a, sal_b, pcts, devidos):
    corpo = _com_base_e_salarios(casal, base, sal_a, sal_b)
    assert _pcts(corpo) == pcts
    assert _devidos(corpo) == devidos
    assert sum(Decimal(d) for d in _devidos(corpo)) == Decimal(base)


# ------------------------------------------------------------------ roteiro t127 (funções puras)

def test_rateio_centavo_do_50_50_fica_com_a_d038():
    assert rateio(Decimal("100.01"), Decimal(1), Decimal(1)) == (Decimal("50.01"), Decimal("50.00"))


def test_rateio_centavo_fica_com_quem_tem_maior_porcentagem():
    assert rateio(Decimal("100.01"), Decimal(6), Decimal(4)) == (Decimal("60.01"), Decimal("40.00"))
    assert rateio(Decimal("100.01"), Decimal(4), Decimal(6)) == (Decimal("40.00"), Decimal("60.01"))


def test_rateio_com_sentinela_decimal_1_e_pesos_iguais_e_soma_a_base():
    a, b = rateio(Decimal("1000.00"), Decimal(1), Decimal(1))
    assert (a, b) == (Decimal("500.00"), Decimal("500.00"))


def test_rateio_base_zero_devolve_zeros():
    assert rateio(Decimal("0.00"), Decimal(6), Decimal(4)) == (Decimal("0.00"), Decimal("0.00"))


def test_percentual_arredonda_da_razao_exata_meio_para_cima():
    assert percentual(650000, 1050000) == Decimal("61.90")
    assert percentual(400000, 1050000) == Decimal("38.10")


# ------------------------------------------------------------------ soma 100,00 e ausência de float

@pytest.mark.parametrize("sal_a,sal_b", [
    ("6000.00", "4000.00"), ("6500.00", "4000.00"), ("3333.33", "6666.67"),
    ("1.00", "2.00"), ("7.77", "13.13"), ("100000.00", "0.01"),
])
def test_soma_das_porcentagens_e_sempre_100(casal, sal_a, sal_b):
    _salario(casal.a, sal_a, "2026-10-05")
    _salario(casal.b, sal_b, "2026-10-05")
    corpo = _proporcao(casal.a.cliente, "2026-10")
    assert sum(Decimal(p) for p in _pcts(corpo)) == Decimal("100.00")


def test_soma_das_porcentagens_e_100_quando_a_razao_cai_no_meio_centesimo(casal):
    # 1,00 de 20.000,00 = 0,005%: A arredonda para cima e B (99,995%) também
    _salario(casal.a, "1.00", "2026-10-05")
    _salario(casal.b, "19999.00", "2026-10-05")
    corpo = _proporcao(casal.a.cliente, "2026-10")
    assert sum(Decimal(p) for p in _pcts(corpo)) == Decimal("100.00"), _pcts(corpo)


def test_json_sem_float_dinheiro_e_porcentagem_como_texto(casal):
    _salario(casal.a, "6500.00", "2026-10-05")
    _salario(casal.b, "4000.00", "2026-10-05")
    _despesa_casal(casal.a, _conjunta(casal.a.cliente), "2500.00", "2026-10-10")

    def sem_float(texto):
        raise AssertionError(f"número JSON não textual: {texto}")

    r = casal.a.cliente.get("/api/proporcao", params={"mes": "2026-10"})
    corpo = json.loads(r.text, parse_float=sem_float)
    for pessoa in corpo["pessoas"]:
        for campo in ("porcentagem", "devido", "aportado", "faltante", "excedente"):
            assert isinstance(pessoa[campo], str)
    assert isinstance(corpo["base_despesas_casal"], str)


# ------------------------------------------------------------------ bordas da rota

def test_proporcao_sem_mes_usa_o_mes_atual(casal):
    r = casal.a.cliente.get("/api/proporcao")
    assert r.status_code == 200, r.text
    assert r.json()["mes"] == "2026-08"


@pytest.mark.parametrize("mes", ["1999-12", "2036-09", "2026-13", "abc"])
def test_proporcao_mes_invalido_ou_fora_do_intervalo_da_422(casal, mes):
    r = casal.a.cliente.get("/api/proporcao", params={"mes": mes})
    assert r.status_code == 422, r.text


def test_proporcao_sem_vinculo_da_409(fab, relogio):
    relogio(HOJE)
    p = fab.uma_pessoa()
    r = p.cliente.get("/api/proporcao", params={"mes": "2026-08"})
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "SEM_VINCULO", r.text
