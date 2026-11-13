"""Fatia 3: criação e geração sob demanda de recorrências (CA-3.01 a CA-3.04, CA-3.09, CA-3.21, CA-3.22)."""
from datetime import date

import pytest


def _categoria(cliente, nome: str, tipo: str = "despesa") -> int:
    r = cliente.get("/api/categorias", params={"tipo": tipo})
    assert r.status_code == 200, r.text
    for raiz in r.json():
        for no in [raiz, *raiz["subcategorias"]]:
            if no["nome"] == nome:
                return no["id"]
    raise AssertionError(f"categoria {nome!r} não encontrada")


def _conta_do(cliente, dono_id) -> int:
    contas = cliente.get("/api/contas").json()["contas"]
    return next(c["id"] for c in contas if c["dono_usuario_id"] == dono_id)


def _conta(cliente, conta_id, mes=None) -> dict:
    params = {} if mes is None else {"mes": mes}
    r = cliente.get("/api/contas", params=params)
    assert r.status_code == 200, r.text
    return next(c for c in r.json()["contas"] if c["id"] == conta_id)


def _despesa(p, conta, data, valor="1500.00", **extra) -> dict:
    corpo = {
        "tipo": "despesa", "valor": valor, "data": data, "descricao": "Aluguel",
        "categoria_id": _categoria(p.cliente, "Mercado"),
        "dono_usuario_id": p.id, "conta_id": conta,
    }
    corpo.update(extra)
    return corpo


def _post(p, corpo):
    return p.cliente.post("/api/lancamentos", json=corpo)


def _criar(p, corpo) -> dict:
    r = _post(p, corpo)
    assert r.status_code == 201, r.text
    return r.json()


def _mes(cliente, mes, **params) -> list[dict]:
    r = cliente.get("/api/lancamentos", params={"mes": mes, **params})
    assert r.status_code == 200, r.text
    return r.json()


def _da_serie(cliente, mes, rec_id) -> list[dict]:
    return [x for x in _mes(cliente, mes) if x["recorrencia_id"] == rec_id]


def _confirmar(cliente, lid, valor=None):
    r = cliente.post(f"/api/lancamentos/{lid}/confirmar", json={} if valor is None else {"valor": valor})
    assert r.status_code == 200, r.text
    return r.json()


def _pessoa_na_data(fab, relogio, hoje: date):
    relogio(hoje)
    p = fab.uma_pessoa()
    return p, _conta_do(p.cliente, p.id)


# ------------------------------------------------------------------ CA-3.01

def test_aluguel_recorrente_aparece_prevista_no_dia_10_nos_meses_seguintes(fab, relogio):
    p, conta = _pessoa_na_data(fab, relogio, date(2026, 3, 5))
    criada = _criar(p, _despesa(p, conta, "2026-03-10", recorrencia={"modo": "sem_fim"}))
    assert criada["recorrente"] is True and criada["numero_recorrencia"] == 1
    for mes, dia in [("2026-03", "2026-03-10"), ("2026-04", "2026-04-10"), ("2027-03", "2027-03-10")]:
        achadas = _da_serie(p.cliente, mes, criada["recorrencia_id"])
        assert [(x["data"], x["situacao"], x["valor"]) for x in achadas] == [
            (dia, "prevista", "1500.00")
        ]


def test_recorrencia_nao_aparece_no_mes_anterior_a_primeira_data(fab, relogio):
    p, conta = _pessoa_na_data(fab, relogio, date(2026, 3, 5))
    _criar(p, _despesa(p, conta, "2026-03-10", recorrencia={"modo": "sem_fim"}))
    assert _mes(p.cliente, "2026-02") == []


# ------------------------------------------------------------------ CA-3.02

@pytest.mark.parametrize(
    ("ano", "ultimo_fev"), [(2026, "2026-02-28"), (2028, "2028-02-29")]
)
def test_primeira_data_dia_31_cai_no_fim_de_fevereiro_e_volta_ao_31_em_marco(
    fab, relogio, ano, ultimo_fev
):
    p, conta = _pessoa_na_data(fab, relogio, date(ano, 3, 15))
    criada = _criar(p, _despesa(p, conta, f"{ano}-01-31", recorrencia={"modo": "sem_fim"}))
    rid = criada["recorrencia_id"]
    datas = {
        mes: [x["data"] for x in _da_serie(p.cliente, f"{ano}-{mes}", rid)]
        for mes in ("01", "02", "03")
    }
    assert datas == {
        "01": [f"{ano}-01-31"], "02": [ultimo_fev], "03": [f"{ano}-03-31"],
    }


def test_dia_31_em_meses_de_30_dias_vai_ao_dia_30_e_nao_se_perde(fab, relogio):
    p, conta = _pessoa_na_data(fab, relogio, date(2026, 1, 20))
    criada = _criar(p, _despesa(p, conta, "2026-03-31", recorrencia={"modo": "sem_fim"}))
    rid = criada["recorrencia_id"]
    assert [x["data"] for x in _da_serie(p.cliente, "2026-04", rid)] == ["2026-04-30"]
    assert [x["data"] for x in _da_serie(p.cliente, "2026-05", rid)] == ["2026-05-31"]


# ------------------------------------------------------------------ CA-3.03

def test_confirmar_com_valor_real_muda_o_saldo_e_nao_as_outras_ocorrencias(fab, relogio):
    p, conta = _pessoa_na_data(fab, relogio, date(2026, 3, 5))
    criada = _criar(p, _despesa(p, conta, "2026-03-10", recorrencia={"modo": "sem_fim"}))
    rid = criada["recorrencia_id"]
    antes = _conta(p.cliente, conta)["saldo_atual"]
    _da_serie(p.cliente, "2026-05", rid)  # gera abril e maio

    confirmada = _confirmar(p.cliente, criada["id"], "1620.00")
    assert (confirmada["situacao"], confirmada["valor"]) == ("confirmada", "1620.00")

    from decimal import Decimal
    depois = _conta(p.cliente, conta)["saldo_atual"]
    assert Decimal(depois) - Decimal(antes) == Decimal("-1620.00")
    for mes in ("2026-04", "2026-05"):
        (o,) = _da_serie(p.cliente, mes, rid)
        assert (o["situacao"], o["valor"]) == ("prevista", "1500.00")


def test_confirmar_uma_ocorrencia_nao_altera_as_demais_confirmadas(fab, relogio):
    p, conta = _pessoa_na_data(fab, relogio, date(2026, 3, 5))
    criada = _criar(p, _despesa(p, conta, "2026-03-10", recorrencia={"modo": "sem_fim"}))
    rid = criada["recorrencia_id"]
    (abril,) = _da_serie(p.cliente, "2026-04", rid)
    _confirmar(p.cliente, abril["id"], "1700.00")
    (marco,) = _da_serie(p.cliente, "2026-03", rid)
    assert (marco["situacao"], marco["valor"]) == ("prevista", "1500.00")


# ------------------------------------------------------------------ CA-3.04

def test_salario_recorrente_confirmado_com_6300_sobe_o_saldo_em_6300(fab, relogio):
    from decimal import Decimal

    p, conta = _pessoa_na_data(fab, relogio, date(2026, 3, 5))
    corpo = {
        "tipo": "receita", "valor": "6000.00", "data": "2026-03-05", "descricao": "Salário",
        "categoria_id": _categoria(p.cliente, "Salário", "receita"),
        "dono_usuario_id": p.id, "conta_id": conta, "recorrencia": {"modo": "sem_fim"},
    }
    criada = _criar(p, corpo)
    assert criada["situacao"] == "prevista"
    (maio,) = _da_serie(p.cliente, "2026-05", criada["recorrencia_id"])
    assert (maio["situacao"], maio["valor"]) == ("prevista", "6000.00")

    antes = Decimal(_conta(p.cliente, conta)["saldo_atual"])
    confirmada = _confirmar(p.cliente, criada["id"], "6300.00")
    assert (confirmada["situacao"], confirmada["valor"]) == ("confirmada", "6300.00")
    assert Decimal(_conta(p.cliente, conta)["saldo_atual"]) - antes == Decimal("6300.00")


def test_13o_como_entrada_unica_prevista_na_subcategoria_13o(fab, relogio):
    p, conta = _pessoa_na_data(fab, relogio, date(2026, 3, 5))
    corpo = {
        "tipo": "receita", "valor": "4000.00", "data": "2026-12-20", "descricao": "13º",
        "categoria_id": _categoria(p.cliente, "13º", "receita"),
        "dono_usuario_id": p.id, "conta_id": conta,
    }
    criada = _criar(p, corpo)
    assert (criada["situacao"], criada["recorrente"], criada["categoria"]["nome"]) == (
        "prevista", False, "13º",
    )
    assert [x["id"] for x in _mes(p.cliente, "2026-12")] == [criada["id"]]


# ------------------------------------------------------------------ CA-3.09

def test_recorrencia_de_tres_meses_atras_exibe_as_passadas_como_atrasadas(fab, relogio):
    p, conta = _pessoa_na_data(fab, relogio, date(2026, 3, 15))
    criada = _criar(p, _despesa(p, conta, "2025-12-10", recorrencia={"modo": "sem_fim"}))
    rid = criada["recorrencia_id"]
    situacoes = {
        mes: [x["situacao"] for x in _da_serie(p.cliente, mes, rid)]
        for mes in ("2025-12", "2026-01", "2026-02", "2026-03", "2026-04")
    }
    assert situacoes == {
        "2025-12": ["atrasada"], "2026-01": ["atrasada"], "2026-02": ["atrasada"],
        "2026-03": ["atrasada"], "2026-04": ["prevista"],
    }


def test_confirmar_uma_atrasada_a_torna_confirmada_e_as_outras_seguem_atrasadas(fab, relogio):
    p, conta = _pessoa_na_data(fab, relogio, date(2026, 3, 15))
    criada = _criar(p, _despesa(p, conta, "2026-01-10", recorrencia={"modo": "sem_fim"}))
    rid = criada["recorrencia_id"]
    (jan,) = _da_serie(p.cliente, "2026-01", rid)
    assert _confirmar(p.cliente, jan["id"])["situacao"] == "confirmada"
    (fev,) = _da_serie(p.cliente, "2026-02", rid)
    assert fev["situacao"] == "atrasada"


def test_ocorrencia_de_ontem_e_atrasada_e_a_de_amanha_e_prevista(fab, relogio):
    p, conta = _pessoa_na_data(fab, relogio, date(2026, 3, 15))
    ontem = _criar(p, _despesa(p, conta, "2026-03-14", recorrencia={"modo": "sem_fim"}))
    amanha = _criar(p, _despesa(p, conta, "2026-03-16", recorrencia={"modo": "sem_fim"}))
    assert (ontem["situacao"], amanha["situacao"]) == ("atrasada", "prevista")


# ------------------------------------------------------------------ CA-3.21

def test_repetir_3_meses_gera_m_m1_m2_e_nada_em_m3(fab, relogio):
    p, conta = _pessoa_na_data(fab, relogio, date(2026, 3, 5))
    criada = _criar(
        p, _despesa(p, conta, "2026-03-10", valor="200.00",
                    recorrencia={"modo": "n_meses", "meses": 3})
    )
    rid = criada["recorrencia_id"]
    achadas = {m: _da_serie(p.cliente, m, rid) for m in ("2026-03", "2026-04", "2026-05", "2026-06")}
    assert [len(v) for v in achadas.values()] == [1, 1, 1, 0]
    assert all(v[0]["situacao"] == "prevista" and v[0]["total_ocorrencias"] == 3
               for v in list(achadas.values())[:3])


def test_repetir_3_meses_com_primeira_data_dois_meses_atras(fab, relogio):
    p, conta = _pessoa_na_data(fab, relogio, date(2026, 3, 15))
    criada = _criar(
        p, _despesa(p, conta, "2026-01-20", valor="200.00",
                    recorrencia={"modo": "n_meses", "meses": 3})
    )
    rid = criada["recorrencia_id"]
    sit = [_da_serie(p.cliente, m, rid)[0]["situacao"] for m in ("2026-01", "2026-02", "2026-03")]
    assert sit == ["atrasada", "atrasada", "prevista"]


def _tres_meses(fab, relogio):
    p, conta = _pessoa_na_data(fab, relogio, date(2026, 3, 5))
    criada = _criar(
        p, _despesa(p, conta, "2026-03-10", valor="200.00",
                    recorrencia={"modo": "n_meses", "meses": 3})
    )
    rid = criada["recorrencia_id"]
    return p, rid, {m: _da_serie(p.cliente, m, rid)[0] for m in ("2026-03", "2026-04", "2026-05")}


def test_excluir_todos_apaga_so_as_tres_ocorrencias(fab, relogio):
    p, rid, oc = _tres_meses(fab, relogio)
    r = p.cliente.delete(f"/api/lancamentos/{oc['2026-04']['id']}", params={"alcance": "todos"})
    assert r.status_code == 204, r.text
    assert [len(_da_serie(p.cliente, m, rid)) for m in ("2026-03", "2026-04", "2026-05")] == [0, 0, 0]


def test_excluir_este_e_pendentes_mantem_so_a_anterior(fab, relogio):
    p, rid, oc = _tres_meses(fab, relogio)
    r = p.cliente.delete(
        f"/api/lancamentos/{oc['2026-04']['id']}", params={"alcance": "este_e_pendentes"}
    )
    assert r.status_code == 204, r.text
    assert [len(_da_serie(p.cliente, m, rid)) for m in ("2026-03", "2026-04", "2026-05")] == [1, 0, 0]


@pytest.mark.parametrize("meses", [1, 61])
def test_repetir_fora_de_2_a_60_meses_e_recusado(fab, relogio, meses):
    p, conta = _pessoa_na_data(fab, relogio, date(2026, 3, 5))
    r = _post(p, _despesa(p, conta, "2026-03-10", recorrencia={"modo": "n_meses", "meses": meses}))
    assert r.status_code == 422, r.text


@pytest.mark.parametrize("meses", [2, 60])
def test_repetir_2_ou_60_meses_e_aceito(fab, relogio, meses):
    p, conta = _pessoa_na_data(fab, relogio, date(2026, 3, 5))
    r = _post(p, _despesa(p, conta, "2026-03-10", recorrencia={"modo": "n_meses", "meses": meses}))
    assert r.status_code == 201, r.text
    assert r.json()["total_ocorrencias"] == meses


def test_receita_mensal_sem_fim_aparece_em_qualquer_mes_futuro(fab, relogio):
    p, conta = _pessoa_na_data(fab, relogio, date(2026, 3, 5))
    corpo = {
        "tipo": "receita", "valor": "6000.00", "data": "2026-03-05", "descricao": "Salário",
        "categoria_id": _categoria(p.cliente, "Salário", "receita"),
        "dono_usuario_id": p.id, "conta_id": conta, "recorrencia": {"modo": "sem_fim"},
    }
    rid = _criar(p, corpo)["recorrencia_id"]
    for mes in ("2027-03", "2030-11", "2036-02"):
        assert len(_da_serie(p.cliente, mes, rid)) == 1


# ------------------------------------------------------------------ CA-3.22

def _transferencia(p, origem, destino, data, **extra) -> dict:
    corpo = {
        "tipo": "transferencia", "valor": "500.00", "data": data,
        "conta_id": origem, "conta_destino_id": destino,
        "recorrencia": {"modo": "sem_fim"},
    }
    corpo.update(extra)
    return corpo


def _casal_com_contas(fab, relogio):
    relogio(date(2026, 3, 1))
    casal = fab.um_casal()
    a, b = casal.a, casal.b
    conta_a = _conta_do(a.cliente, a.id)
    conta_b = _conta_do(b.cliente, b.id)
    conjunta = next(
        c["id"] for c in a.cliente.get("/api/contas").json()["contas"]
        if c["dono_usuario_id"] is None
    )
    return casal, conta_a, conta_b, conjunta


def _aportado(cliente, mes, usuario_id) -> str:
    r = cliente.get("/api/proporcao", params={"mes": mes})
    assert r.status_code == 200, r.text
    return next(x["aportado"] for x in r.json()["pessoas"] if x["usuario_id"] == usuario_id)


def test_transferencia_recorrente_para_a_conjunta_e_aporte_previsto_nos_meses(fab, relogio):
    casal, conta_a, _, conjunta = _casal_com_contas(fab, relogio)
    criada = _criar(casal.a, _transferencia(casal.a, conta_a, conjunta, "2026-03-05"))
    rid = criada["recorrencia_id"]
    for mes in ("2026-03", "2026-04", "2026-09"):
        (o,) = _da_serie(casal.a.cliente, mes, rid)
        assert (o["aporte"], o["situacao"]) == (True, "prevista")


def test_confirmar_o_aporte_de_m_aumenta_o_aportado_so_em_m(fab, relogio):
    casal, conta_a, _, conjunta = _casal_com_contas(fab, relogio)
    criada = _criar(casal.a, _transferencia(casal.a, conta_a, conjunta, "2026-03-05"))
    rid = criada["recorrencia_id"]
    _da_serie(casal.a.cliente, "2026-04", rid)
    assert _aportado(casal.a.cliente, "2026-03", casal.a.id) == "0.00"
    _confirmar(casal.a.cliente, criada["id"])
    assert _aportado(casal.a.cliente, "2026-03", casal.a.id) == "500.00"
    assert _aportado(casal.a.cliente, "2026-04", casal.a.id) == "0.00"
    assert _aportado(casal.a.cliente, "2026-03", casal.b.id) == "0.00"


def test_transferencia_recorrente_entre_individuais_nao_e_aporte(fab, relogio):
    casal, conta_a, conta_b, _ = _casal_com_contas(fab, relogio)
    criada = _criar(casal.a, _transferencia(casal.a, conta_a, conta_b, "2026-03-05"))
    assert criada["aporte"] is False
    _confirmar(casal.a.cliente, criada["id"])
    assert _aportado(casal.a.cliente, "2026-03", casal.a.id) == "0.00"


def test_previstas_futuras_reduzem_o_previsto_de_a_e_aumentam_o_da_conjunta(fab, relogio):
    from decimal import Decimal

    casal, conta_a, _, conjunta = _casal_com_contas(fab, relogio)
    _criar(casal.a, _transferencia(casal.a, conta_a, conjunta, "2026-03-05"))
    cli = casal.a.cliente
    a_antes, c_antes = _conta(cli, conta_a, "2026-03"), _conta(cli, conjunta, "2026-03")
    a_depois, c_depois = _conta(cli, conta_a, "2026-05"), _conta(cli, conjunta, "2026-05")
    # março, abril e maio: três ocorrências previstas até o fim de maio; março já está no primeiro
    assert Decimal(a_antes["saldo_previsto"]) - Decimal(a_depois["saldo_previsto"]) == Decimal("1000.00")
    assert Decimal(c_depois["saldo_previsto"]) - Decimal(c_antes["saldo_previsto"]) == Decimal("1000.00")
    assert Decimal(a_antes["saldo_previsto"]) == Decimal("-500.00")
    assert Decimal(a_antes["saldo_atual"]) == Decimal(a_antes["saldo_inicial"])
