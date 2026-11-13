"""Fatia 3: efeito do desvínculo nas recorrências entre as duas contas individuais (D-036; comum.md §7.3 regra 4)."""
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


def _transferir(p, origem, destino, **extra):
    corpo = {
        "tipo": "transferencia", "valor": "200.00", "data": "2026-03-10",
        "conta_id": origem, "conta_destino_id": destino,
    }
    corpo.update(extra)
    r = p.cliente.post("/api/lancamentos", json=corpo)
    assert r.status_code == 201, r.text
    return r.json()


def _do_mes(cliente, mes) -> list[dict]:
    r = cliente.get("/api/lancamentos", params={"mes": mes})
    assert r.status_code == 200, r.text
    return r.json()


def _todos(cliente, meses=MESES, **filtro) -> list[dict]:
    achados = []
    for mes in meses:
        achados += [x for x in _do_mes(cliente, mes) if all(x.get(k) == v for k, v in filtro.items())]
    return achados


def _desvincular(p):
    r = p.cliente.post("/api/vinculo/desvincular", json={"confirmar": True})
    assert r.status_code == 200, r.text


@pytest.fixture
def par(fab, relogio):
    """Casal com as individuais de A e de B e uma transferência mensal A -> B (mar/2026 em diante)."""
    relogio(HOJE)
    c = fab.um_casal()
    ind_a, ind_b = _conta_de(c.a.cliente, c.a.id), _conta_de(c.a.cliente, c.b.id)
    return c, ind_a, ind_b


def _serie_recorrente(c, ind_a, ind_b, confirmar=(1, 2), modo=None):
    """Transferência mensal A -> B de mar a ago/2026 (6 ocorrências, geradas ao listar até agosto)."""
    modo = modo or {"modo": "n_meses", "meses": 6}
    criada = _transferir(c.a, ind_a, ind_b, recorrencia=modo)
    rid = criada["recorrencia_id"]
    ate_agosto = MESES[:6]
    serie = {x["numero_recorrencia"]: x for x in _todos(c.a.cliente, ate_agosto, recorrencia_id=rid)}
    assert list(serie) == [1, 2, 3, 4, 5, 6]  # mar a ago/2026, geradas ao listar
    for n in confirmar:
        r = c.a.cliente.post(f"/api/lancamentos/{serie[n]['id']}/confirmar", json={})
        assert r.status_code == 200, r.text
    return rid, serie


def test_desvinculo_encerra_a_recorrencia_e_apaga_as_previstas(par):
    c, ind_a, ind_b = par
    rid, _ = _serie_recorrente(c, ind_a, ind_b)
    _desvincular(c.a)
    for p in (c.a, c.b):
        restantes = _todos(p.cliente, recorrencia_id=rid)
        assert sorted(x["numero_recorrencia"] for x in restantes) == [1, 2]
        assert {x["situacao"] for x in restantes} == {"confirmada"}


def test_desvinculo_nao_gera_novas_ocorrencias_nem_nos_meses_futuros(par, relogio):
    c, ind_a, ind_b = par
    rid, _ = _serie_recorrente(c, ind_a, ind_b, modo={"modo": "sem_fim"})
    _desvincular(c.a)
    relogio(date(2027, 1, 15))
    for p in (c.a, c.b):
        assert sorted(x["numero_recorrencia"] for x in _todos(p.cliente, recorrencia_id=rid)) == [1, 2]


def test_numero_final_vira_a_ultima_ocorrencia_gerada(par):
    c, ind_a, ind_b = par
    rid, _ = _serie_recorrente(c, ind_a, ind_b)
    _desvincular(c.a)
    restantes = _todos(c.a.cliente, recorrencia_id=rid)
    assert {x["total_ocorrencias"] for x in restantes} == {6}


def test_confirmadas_ficam_como_historico_e_continuam_no_saldo_das_duas_contas(par):
    c, ind_a, ind_b = par
    _serie_recorrente(c, ind_a, ind_b)
    antes_a, antes_b = _saldo(c.a.cliente, ind_a), _saldo(c.b.cliente, ind_b)
    _desvincular(c.a)
    assert _saldo(c.a.cliente, ind_a) - antes_a == Decimal("0.00")
    assert _saldo(c.b.cliente, ind_b) - antes_b == Decimal("0.00")
    # as 2 confirmadas (2 x 200,00) seguem somadas em cada conta
    assert (antes_a, antes_b) == (Decimal("-400.00"), Decimal("400.00"))


def test_confirmadas_ficam_somente_leitura(par):
    c, ind_a, ind_b = par
    rid, serie = _serie_recorrente(c, ind_a, ind_b)
    _desvincular(c.a)
    for p in (c.a, c.b):
        r = p.cliente.delete(f"/api/lancamentos/{serie[1]['id']}", params={"alcance": "todos"})
        assert r.status_code in (404, 409), r.text
    assert sorted(x["numero_recorrencia"] for x in _todos(c.a.cliente, recorrencia_id=rid)) == [1, 2]


def test_recorrencia_sem_nenhuma_confirmada_some_por_inteiro(par):
    c, ind_a, ind_b = par
    rid, _ = _serie_recorrente(c, ind_a, ind_b, confirmar=())
    antes_a = _saldo(c.a.cliente, ind_a)
    _desvincular(c.a)
    for p in (c.a, c.b):
        assert _todos(p.cliente, recorrencia_id=rid) == []
    assert _saldo(c.a.cliente, ind_a) == antes_a


def test_transferencia_avulsa_prevista_entre_as_individuais_e_apagada(par):
    c, ind_a, ind_b = par
    prevista = _transferir(c.a, ind_a, ind_b, data="2026-09-10", situacao="prevista")
    _desvincular(c.a)
    assert c.a.cliente.get(f"/api/lancamentos/{prevista['id']}").status_code == 404
    assert c.b.cliente.get(f"/api/lancamentos/{prevista['id']}").status_code == 404
    for p in (c.a, c.b):
        assert [x for x in _do_mes(p.cliente, "2026-09") if x["id"] == prevista["id"]] == []


def test_transferencia_avulsa_confirmada_entre_as_individuais_fica_e_soma_no_saldo(par):
    c, ind_a, ind_b = par
    conf = _transferir(c.a, ind_a, ind_b, data="2026-07-10", situacao="confirmada")
    antes_a, antes_b = _saldo(c.a.cliente, ind_a), _saldo(c.b.cliente, ind_b)
    _desvincular(c.a)
    assert c.a.cliente.get(f"/api/lancamentos/{conf['id']}").status_code == 200
    assert _saldo(c.a.cliente, ind_a) == antes_a
    assert _saldo(c.b.cliente, ind_b) == antes_b
    assert antes_a == Decimal("-200.00") and antes_b == Decimal("200.00")


def test_recorrencia_de_despesa_numa_individual_nao_e_encerrada_pelo_desvinculo(par):
    c, ind_a, _ = par
    r = c.a.cliente.post("/api/lancamentos", json={
        "tipo": "despesa", "valor": "80.00", "data": "2026-07-10", "descricao": "Academia",
        "categoria_id": _categoria(c.a.cliente), "dono_usuario_id": c.a.id, "conta_id": ind_a,
        "recorrencia": {"modo": "sem_fim"},
    })
    assert r.status_code == 201, r.text
    rid = r.json()["recorrencia_id"]
    _desvincular(c.a)
    meses = {x["data"][:7] for x in _todos(c.a.cliente, recorrencia_id=rid)}
    assert {"2026-07", "2026-08", "2026-12", "2027-02"} <= meses
