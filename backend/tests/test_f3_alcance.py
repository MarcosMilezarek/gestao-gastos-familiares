"""Fatia 3: editar e excluir recorrências com alcance (CA-3.05 a CA-3.07, API de CA-0.10; t126r e t126cr)."""
from datetime import date
from decimal import Decimal

import pytest

HOJE = date(2026, 8, 5)
MESES = [f"2026-{m:02d}" for m in range(3, 13)] + ["2027-01", "2027-02"]


def _categoria(cliente, nome: str = "Mercado") -> int:
    r = cliente.get("/api/categorias", params={"tipo": "despesa"})
    assert r.status_code == 200, r.text
    for raiz in r.json():
        for no in [raiz, *raiz["subcategorias"]]:
            if no["nome"] == nome:
                return no["id"]
    raise AssertionError(nome)


def _conta_de(cliente, dono_id) -> int:
    contas = cliente.get("/api/contas").json()["contas"]
    return next(c["id"] for c in contas if c["dono_usuario_id"] == dono_id)


def _saldo(cliente, conta_id) -> Decimal:
    r = cliente.get(f"/api/contas/{conta_id}")
    assert r.status_code == 200, r.text
    return Decimal(r.json()["saldo_atual"])


def _serie(cliente, rid) -> dict[int, dict]:
    """Ocorrências visíveis da recorrência, por numero_recorrencia."""
    achadas = {}
    for mes in MESES:
        r = cliente.get("/api/lancamentos", params={"mes": mes})
        assert r.status_code == 200, r.text
        for x in r.json():
            if x["recorrencia_id"] == rid:
                achadas[x["numero_recorrencia"]] = x
    return dict(sorted(achadas.items()))


def _valores(serie) -> dict[int, str]:
    return {n: x["valor"] for n, x in serie.items()}


@pytest.fixture
def seis(fab, relogio):
    """Despesa de 100,00 em 6 ocorrências (mar a ago/2026), a 1ª e a 2ª confirmadas."""
    relogio(HOJE)
    p = fab.uma_pessoa()
    conta = _conta_de(p.cliente, p.id)
    r = p.cliente.post("/api/lancamentos", json={
        "tipo": "despesa", "valor": "100.00", "data": "2026-03-10", "descricao": "Aluguel",
        "categoria_id": _categoria(p.cliente), "dono_usuario_id": p.id, "conta_id": conta,
        "recorrencia": {"modo": "n_meses", "meses": 6},
    })
    assert r.status_code == 201, r.text
    rid = r.json()["recorrencia_id"]
    serie = _serie(p.cliente, rid)
    assert list(serie) == [1, 2, 3, 4, 5, 6]
    for n in (1, 2):
        c = p.cliente.post(f"/api/lancamentos/{serie[n]['id']}/confirmar", json={})
        assert c.status_code == 200, c.text
    serie = _serie(p.cliente, rid)
    # a saída mostra "atrasada" para a pendente vencida; a coluna segue "prevista"
    assert [x["situacao"] == "confirmada" for x in serie.values()] == [True] * 2 + [False] * 4
    return p, conta, rid, serie


def _patch(p, lid, corpo, alcance=None):
    params = {} if alcance is None else {"alcance": alcance}
    return p.cliente.patch(f"/api/lancamentos/{lid}", params=params, json=corpo)


def _delete(p, lid, alcance=None):
    params = {} if alcance is None else {"alcance": alcance}
    return p.cliente.delete(f"/api/lancamentos/{lid}", params=params)


# ------------------------------------------------------------------ CA-3.05

def test_editar_valor_da_4a_somente_este_altera_so_a_4a(seis):
    p, _, rid, serie = seis
    r = _patch(p, serie[4]["id"], {"valor": "120.00"}, "somente_este")
    assert r.status_code == 200, r.text
    assert _valores(_serie(p.cliente, rid)) == {
        1: "100.00", 2: "100.00", 3: "100.00", 4: "120.00", 5: "100.00", 6: "100.00",
    }


def test_editar_valor_da_4a_este_e_pendentes_altera_da_4a_em_diante(seis):
    p, _, rid, serie = seis
    r = _patch(p, serie[4]["id"], {"valor": "120.00"}, "este_e_pendentes")
    assert r.status_code == 200, r.text
    assert r.json()["id"] == serie[4]["id"] and r.json()["valor"] == "120.00"
    assert _valores(_serie(p.cliente, rid)) == {
        1: "100.00", 2: "100.00", 3: "100.00", 4: "120.00", 5: "120.00", 6: "120.00",
    }


def test_editar_valor_todos_altera_as_6_e_o_saldo_reflete_as_2_confirmadas(seis):
    p, conta, rid, serie = seis
    antes = _saldo(p.cliente, conta)
    r = _patch(p, serie[4]["id"], {"valor": "120.00"}, "todos")
    assert r.status_code == 200, r.text
    assert set(_valores(_serie(p.cliente, rid)).values()) == {"120.00"}
    assert _saldo(p.cliente, conta) - antes == Decimal("-40.00")


def test_editar_confirmada_nao_muda_as_demais_em_somente_este(seis):
    p, conta, rid, serie = seis
    antes = _saldo(p.cliente, conta)
    assert _patch(p, serie[1]["id"], {"valor": "130.00"}, "somente_este").status_code == 200
    assert _saldo(p.cliente, conta) - antes == Decimal("-30.00")
    assert _valores(_serie(p.cliente, rid))[2] == "100.00"


# CA-3.12 (t126r): este_e_pendentes sobre a 3ª (1ª pendente) e sobre a 2ª (confirmada)
def test_este_e_pendentes_na_primeira_pendente_nao_toca_as_confirmadas(seis):
    p, _, rid, serie = seis
    assert _patch(p, serie[3]["id"], {"valor": "90.00"}, "este_e_pendentes").status_code == 200
    assert _valores(_serie(p.cliente, rid)) == {
        1: "100.00", 2: "100.00", 3: "90.00", 4: "90.00", 5: "90.00", 6: "90.00",
    }


def test_este_e_pendentes_numa_confirmada_inclui_a_propria_e_as_pendentes_seguintes(seis):
    p, _, rid, serie = seis
    assert _patch(p, serie[2]["id"], {"valor": "90.00"}, "este_e_pendentes").status_code == 200
    s = _serie(p.cliente, rid)
    assert _valores(s) == {
        1: "100.00", 2: "90.00", 3: "90.00", 4: "90.00", 5: "90.00", 6: "90.00",
    }
    assert s[2]["situacao"] == "confirmada"


def test_alcance_multiplo_recusa_alterar_situacao(seis):
    p, _, rid, serie = seis
    for alcance in ("este_e_pendentes", "todos"):
        r = _patch(p, serie[4]["id"], {"situacao": "confirmada"}, alcance)
        assert r.status_code == 422, r.text
        assert "situacao" in r.json()["erro"]["campos"]
    assert _serie(p.cliente, rid)[4]["situacao"] != "confirmada"


# S2 (t126r): a data nova deve ficar no mês da ocorrência; só o dia vale para as demais
def test_alcance_multiplo_recusa_data_fora_do_mes_da_ocorrencia(seis):
    p, _, rid, serie = seis
    antes = _serie(p.cliente, rid)
    r = _patch(p, serie[4]["id"], {"data": "2026-07-15"}, "este_e_pendentes")
    assert r.status_code == 422, r.text
    assert "data" in r.json()["erro"]["campos"]
    assert _serie(p.cliente, rid) == antes


def test_alcance_multiplo_com_data_no_mes_altera_so_o_dia_das_ocorrencias(seis):
    p, _, rid, serie = seis
    r = _patch(p, serie[4]["id"], {"data": "2026-06-15"}, "este_e_pendentes")
    assert r.status_code == 200, r.text
    datas = {n: x["data"] for n, x in _serie(p.cliente, rid).items()}
    assert datas == {
        1: "2026-03-10", 2: "2026-04-10", 3: "2026-05-10",
        4: "2026-06-15", 5: "2026-07-15", 6: "2026-08-15",
    }


# ------------------------------------------------------------------ CA-3.06

def test_excluir_a_4a_somente_esta_remove_so_ela_e_ela_nao_volta(seis):
    p, _, rid, serie = seis
    assert _delete(p, serie[4]["id"], "somente_este").status_code == 204
    assert list(_serie(p.cliente, rid)) == [1, 2, 3, 5, 6]


def test_excluir_a_4a_este_e_pendentes_remove_da_4a_em_diante_e_nada_aparece_depois(seis):
    p, _, rid, serie = seis
    assert _delete(p, serie[4]["id"], "este_e_pendentes").status_code == 204
    assert list(_serie(p.cliente, rid)) == [1, 2, 3]
    # meses seguintes (inclusive futuros, que acionariam a geração) seguem sem ocorrência
    for mes in ("2026-09", "2027-06"):
        r = p.cliente.get("/api/lancamentos", params={"mes": mes})
        assert [x for x in r.json() if x["recorrencia_id"] == rid] == []
    assert [x["total_ocorrencias"] for x in _serie(p.cliente, rid).values()] == [3, 3, 3]


def test_excluir_todos_remove_as_6_e_o_saldo_volta_ao_valor_anterior_as_confirmadas(seis):
    p, conta, rid, serie = seis
    antes = _saldo(p.cliente, conta)
    assert _delete(p, serie[4]["id"], "todos").status_code == 204
    assert _serie(p.cliente, rid) == {}
    assert _saldo(p.cliente, conta) - antes == Decimal("200.00")


# S1 (t126r): confirmada adiantada sobra; n = 1 gera total_ocorrencias = 0
def test_excluir_este_e_pendentes_com_confirmada_posterior_mantem_a_confirmada(seis):
    p, _, rid, serie = seis
    assert p.cliente.post(f"/api/lancamentos/{serie[5]['id']}/confirmar", json={}).status_code == 200
    assert _delete(p, serie[4]["id"], "este_e_pendentes").status_code == 204
    s = _serie(p.cliente, rid)
    assert list(s) == [1, 2, 3, 5]
    assert s[5]["situacao"] == "confirmada" and s[5]["total_ocorrencias"] == 3


def test_excluir_a_1a_este_e_pendentes_com_confirmadas_sobrando_zera_total_ocorrencias(seis):
    p, _, rid, serie = seis
    # 1ª e 2ª confirmadas: excluir a 1ª com "este e os pendentes" apaga a 1ª e as 4 pendentes
    assert _delete(p, serie[1]["id"], "este_e_pendentes").status_code == 204
    s = _serie(p.cliente, rid)
    assert list(s) == [2]
    assert s[2]["total_ocorrencias"] == 0


def test_excluir_a_1a_este_e_pendentes_sem_nada_sobrando_apaga_a_recorrencia(fab, relogio):
    relogio(HOJE)
    p = fab.uma_pessoa()
    r = p.cliente.post("/api/lancamentos", json={
        "tipo": "despesa", "valor": "50.00", "data": "2026-07-10", "descricao": "Streaming",
        "categoria_id": _categoria(p.cliente), "dono_usuario_id": p.id,
        "conta_id": _conta_de(p.cliente, p.id), "recorrencia": {"modo": "n_meses", "meses": 2},
    })
    assert r.status_code == 201, r.text
    rid, lid = r.json()["recorrencia_id"], r.json()["id"]
    assert len(_serie(p.cliente, rid)) == 2
    assert _delete(p, lid, "este_e_pendentes").status_code == 204
    assert _serie(p.cliente, rid) == {}
    assert p.cliente.get("/api/lancamentos", params={"mes": "2026-08"}).json() == []


# ------------------------------------------------------------------ CA-3.07 e CA-0.10 (API)

def _avulso(p, **extra):
    corpo = {
        "tipo": "despesa", "valor": "10.00", "data": "2026-08-01", "descricao": "Pão",
        "categoria_id": _categoria(p.cliente), "dono_usuario_id": p.id,
        "conta_id": _conta_de(p.cliente, p.id),
    }
    corpo.update(extra)
    r = p.cliente.post("/api/lancamentos", json=corpo)
    assert r.status_code == 201, r.text
    assert r.json()["recorrente"] is False
    return r.json()


def test_editar_lancamento_simples_sem_alcance_funciona(fab, relogio):
    relogio(HOJE)
    p = fab.uma_pessoa()
    lanc = _avulso(p)
    r = _patch(p, lanc["id"], {"valor": "11.00"})
    assert r.status_code == 200, r.text
    assert r.json()["valor"] == "11.00"


def test_excluir_lancamento_simples_sem_alcance_funciona(fab, relogio):
    relogio(HOJE)
    p = fab.uma_pessoa()
    lanc = _avulso(p)
    assert _delete(p, lanc["id"]).status_code == 204
    assert p.cliente.get(f"/api/lancamentos/{lanc['id']}").status_code == 404


@pytest.mark.parametrize("alcance", ["somente_este", "este_e_pendentes", "todos"])
def test_lancamento_simples_ignora_qualquer_alcance(fab, relogio, alcance):
    relogio(HOJE)
    p = fab.uma_pessoa()
    lanc = _avulso(p)
    assert _patch(p, lanc["id"], {"valor": "12.00"}, alcance).json()["valor"] == "12.00"
    assert _delete(p, lanc["id"], alcance).status_code == 204


def test_editar_recorrente_sem_alcance_da_422_e_nada_muda(seis):
    p, _, rid, serie = seis
    r = _patch(p, serie[4]["id"], {"valor": "120.00"})
    assert r.status_code == 422, r.text
    erro = r.json()["erro"]
    assert erro["codigo"] == "VALIDACAO" and "alcance" in erro["campos"]
    assert _valores(_serie(p.cliente, rid)) == {n: "100.00" for n in range(1, 7)}


def test_excluir_recorrente_sem_alcance_da_422_e_nada_muda(seis):
    p, _, rid, serie = seis
    r = _delete(p, serie[4]["id"])
    assert r.status_code == 422, r.text
    erro = r.json()["erro"]
    assert erro["codigo"] == "VALIDACAO" and "alcance" in erro["campos"]
    assert list(_serie(p.cliente, rid)) == [1, 2, 3, 4, 5, 6]


def test_alcance_com_valor_invalido_da_422(seis):
    p, _, _, serie = seis
    assert _delete(p, serie[4]["id"], "tudo").status_code == 422
    assert _patch(p, serie[4]["id"], {"valor": "1.00"}, "tudo").status_code == 422


# ------------------------------------------------------------------ t126cr: I1 (pontas) e S3

def _transferencia_recorrente(casal):
    a, b = casal.a, casal.b
    ind_a, ind_b = _conta_de(a.cliente, a.id), _conta_de(a.cliente, b.id)
    r = a.cliente.post("/api/lancamentos", json={
        "tipo": "transferencia", "valor": "100.00", "data": "2026-03-10",
        "conta_id": ind_a, "conta_destino_id": ind_b,
        "recorrencia": {"modo": "n_meses", "meses": 6},
    })
    assert r.status_code == 201, r.text
    return r.json()["recorrencia_id"], ind_a, ind_b


def test_ocorrencia_movida_para_conta_nao_visivel_nao_deixa_alcance_multiplo_agir(fab, relogio):
    """I1 cenário 1: pontas de outras ocorrências invisíveis -> 409 LANCAMENTO_SOMENTE_LEITURA."""
    relogio(HOJE)
    c = fab.um_casal()
    a = c.a
    ind_a = _conta_de(a.cliente, a.id)
    conjunta = next(x["id"] for x in a.cliente.get("/api/contas").json()["contas"]
                    if x["dono_usuario_id"] is None)
    r = a.cliente.post("/api/lancamentos", json={
        "tipo": "despesa", "valor": "100.00", "data": "2026-03-10", "descricao": "Aluguel",
        "categoria_id": _categoria(a.cliente), "dono_usuario_id": a.id, "conta_id": ind_a,
        "recorrencia": {"modo": "n_meses", "meses": 6},
    })
    assert r.status_code == 201, r.text
    rid = r.json()["recorrencia_id"]
    serie = _serie(a.cliente, rid)
    # A leva a 4ª para a conjunta: B a vê pela conjunta; depois do desvínculo B continua
    # vendo a conjunta (arquivada) mas não a individual de A, onde está o resto da série.
    mov = _patch(a, serie[4]["id"], {"conta_id": conjunta, "dono_usuario_id": None}, "somente_este")
    assert mov.status_code == 200, mov.text
    d = a.cliente.post("/api/vinculo/desvincular", json={"confirmar": True})
    assert d.status_code == 200, d.text
    for alcance in ("este_e_pendentes", "todos"):
        r = _delete(c.b, serie[4]["id"], alcance)
        assert r.status_code == 409, r.text
        # a conjunta arquivada responde CONTA_ARQUIVADA antes da checagem de pontas
        assert r.json()["erro"]["codigo"] in ("LANCAMENTO_SOMENTE_LEITURA", "CONTA_ARQUIVADA")
    assert list(_serie(a.cliente, rid)) == [1, 2, 3, 4, 5, 6]


def test_alcance_todos_com_ocorrencia_movida_nao_gera_erro_interno_no_check(fab, relogio):
    """I1 cenário 2: A->B, 3ª movida para A->conjunta; `todos` só com conta_id = conjunta -> 422, não 500."""
    relogio(HOJE)
    c = fab.um_casal()
    a = c.a
    rid, ind_a, _ind_b = _transferencia_recorrente(c)
    conta_c = next(x["id"] for x in a.cliente.get("/api/contas").json()["contas"]
                   if x["dono_usuario_id"] is None)
    serie = _serie(a.cliente, rid)
    mov = _patch(a, serie[3]["id"], {"conta_destino_id": conta_c}, "somente_este")
    assert mov.status_code == 200, mov.text
    r = _patch(a, serie[4]["id"], {"conta_id": conta_c}, "todos")
    assert r.status_code == 422, r.text
    assert "conta_destino_id" in r.json()["erro"]["campos"]
    s = _serie(a.cliente, rid)
    assert {x["conta_id"] for x in s.values()} == {ind_a}


def test_excluir_todos_duas_vezes_a_segunda_responde_404(seis):
    p, _, _rid, serie = seis
    assert _delete(p, serie[4]["id"], "todos").status_code == 204
    r = _delete(p, serie[4]["id"], "todos")
    assert r.status_code == 404, r.text
