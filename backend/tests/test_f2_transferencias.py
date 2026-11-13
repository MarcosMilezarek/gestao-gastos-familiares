"""Fatia 2: transferência e aporte (CA-2.19, CA-2.20) e conta arquivada (CA-2.21)."""
from datetime import date
from decimal import Decimal

import pytest

HOJE = date(2026, 3, 15)


def _contas(cliente) -> list[dict]:
    r = cliente.get("/api/contas")
    assert r.status_code == 200, r.text
    return r.json()["contas"]


def _conta_de(cliente, dono_id) -> int:
    return next(c["id"] for c in _contas(cliente) if c["dono_usuario_id"] == dono_id)


def _categoria(cliente, nome: str, tipo: str = "despesa") -> int:
    for raiz in cliente.get("/api/categorias", params={"tipo": tipo}).json():
        for no in [raiz, *raiz["subcategorias"]]:
            if no["nome"] == nome:
                return no["id"]
    raise AssertionError(nome)


def _transferir(cliente, origem, destino, valor="200.00", **extra):
    corpo = {
        "tipo": "transferencia", "valor": valor, "data": "2026-03-10",
        "conta_id": origem, "conta_destino_id": destino,
    }
    corpo.update(extra)
    return cliente.post("/api/lancamentos", json=corpo)


def _saldo(cliente, conta_id) -> Decimal:
    return Decimal(cliente.get(f"/api/contas/{conta_id}").json()["saldo_atual"])


@pytest.fixture
def par(fab, relogio):
    relogio(HOJE)
    casal = fab.um_casal()
    a = casal.a.cliente
    return {
        "casal": casal,
        "a": a,
        "conta_a": _conta_de(a, casal.a.id),
        "conta_b": _conta_de(casal.b.cliente, casal.b.id),
        "conjunta": _conta_de(a, None),
    }


# ------------------------------------------------------------------ CA-2.19

def test_transferencia_confirmada_move_200_da_origem_para_a_conjunta(par):
    a = par["a"]
    antes_a, antes_c = _saldo(a, par["conta_a"]), _saldo(a, par["conjunta"])
    r = _transferir(a, par["conta_a"], par["conjunta"])
    assert r.status_code == 201, r.text
    corpo = r.json()
    assert (corpo["tipo"], corpo["valor"], corpo["situacao"]) == (
        "transferencia", "200.00", "confirmada",
    )
    assert corpo["conta_id"] == par["conta_a"] and corpo["conta_destino_id"] == par["conjunta"]
    assert corpo["categoria"] is None and corpo["dono_usuario_id"] is None
    assert _saldo(a, par["conta_a"]) == antes_a - 200
    assert _saldo(a, par["conjunta"]) == antes_c + 200


def test_transferencia_nao_muda_entradas_e_saidas_do_balanco(par):
    a = par["a"]
    antes = a.get("/api/balanco", params={"mes": "2026-03"}).json()["total"]
    assert _transferir(a, par["conta_a"], par["conjunta"]).status_code == 201
    depois = a.get("/api/balanco", params={"mes": "2026-03"}).json()["total"]
    assert depois == antes


def test_transferencia_aparece_uma_so_vez_na_lista_e_nas_duas_contas(par):
    a = par["a"]
    criada = _transferir(a, par["conta_a"], par["conjunta"]).json()
    assert [x["id"] for x in a.get("/api/lancamentos", params={"mes": "2026-03"}).json()] == [
        criada["id"]
    ]
    for conta in (par["conta_a"], par["conjunta"]):
        lista = a.get("/api/lancamentos", params={"mes": "2026-03", "conta_id": conta}).json()
        assert [x["id"] for x in lista] == [criada["id"]]


def test_transferencia_com_origem_igual_ao_destino_e_recusada(par):
    r = _transferir(par["a"], par["conta_a"], par["conta_a"])
    assert r.status_code == 422, r.text
    assert "conta_destino_id" in r.json()["erro"]["campos"]


@pytest.mark.parametrize("valor", ["0.00", "-10.00"])
def test_transferencia_com_valor_zero_ou_negativo_e_recusada(par, valor):
    assert _transferir(par["a"], par["conta_a"], par["conjunta"], valor).status_code == 422


def test_transferencia_aceita_descricao_tags_e_observacao_e_ignora_categoria_e_dono(par):
    a = par["a"]
    tag = a.post("/api/tags", json={"nome": "aporte"}).json()["id"]
    r = _transferir(
        a, par["conta_a"], par["conjunta"], descricao="Mês", tag_ids=[tag], observacao="obs"
    )
    assert r.status_code == 201, r.text
    assert r.json()["descricao"] == "Mês" and r.json()["observacao"] == "obs"
    assert [t["id"] for t in r.json()["tags"]] == [tag]
    # Campos de despesa/receita enviados numa transferência são ignorados (nada é gravado).
    r = _transferir(
        a, par["conta_a"], par["conjunta"],
        categoria_id=_categoria(a, "Mercado"), dono_usuario_id=par["casal"].a.id,
    )
    assert r.status_code == 201, r.text
    assert r.json()["categoria"] is None and r.json()["dono_usuario_id"] is None


def test_transferencia_para_conta_de_outro_casal_e_recusada(fab, relogio):
    relogio(HOJE)
    c1, c2 = fab.dois_casais()
    alheia = _conta_de(c2.a.cliente, c2.a.id)
    r = _transferir(c1.a.cliente, _conta_de(c1.a.cliente, c1.a.id), alheia)
    assert r.status_code == 422, r.text
    assert "conta_destino_id" in r.json()["erro"]["campos"]


def test_editar_valor_de_transferencia_ajusta_os_dois_saldos(par):
    a = par["a"]
    antes_a, antes_c = _saldo(a, par["conta_a"]), _saldo(a, par["conjunta"])
    criada = _transferir(a, par["conta_a"], par["conjunta"]).json()
    r = a.patch(f"/api/lancamentos/{criada['id']}", json={"valor": "50.00"})
    assert r.status_code == 200, r.text
    assert _saldo(a, par["conta_a"]) == antes_a - 50
    assert _saldo(a, par["conjunta"]) == antes_c + 50


def test_excluir_transferencia_devolve_os_dois_saldos(par):
    a = par["a"]
    antes_a, antes_c = _saldo(a, par["conta_a"]), _saldo(a, par["conjunta"])
    criada = _transferir(a, par["conta_a"], par["conjunta"]).json()
    assert a.delete(f"/api/lancamentos/{criada['id']}").status_code == 204
    assert _saldo(a, par["conta_a"]) == antes_a
    assert _saldo(a, par["conjunta"]) == antes_c


def test_transferencia_prevista_so_move_saldo_ao_confirmar(par):
    a = par["a"]
    antes_a, antes_c = _saldo(a, par["conta_a"]), _saldo(a, par["conjunta"])
    criada = _transferir(a, par["conta_a"], par["conjunta"], data="2026-03-20").json()
    assert criada["situacao"] == "prevista"
    assert _saldo(a, par["conta_a"]) == antes_a and _saldo(a, par["conjunta"]) == antes_c
    r = a.post(f"/api/lancamentos/{criada['id']}/confirmar", json={"valor": "150.00"})
    assert r.status_code == 200, r.text
    assert _saldo(a, par["conta_a"]) == antes_a - 150
    assert _saldo(a, par["conjunta"]) == antes_c + 150


def test_trocar_a_conta_de_destino_na_edicao_para_a_mesma_da_origem_e_recusado(par):
    a = par["a"]
    criada = _transferir(a, par["conta_a"], par["conjunta"]).json()
    r = a.patch(f"/api/lancamentos/{criada['id']}", json={"conta_destino_id": par["conta_a"]})
    assert r.status_code == 422


# ------------------------------------------------------------------ CA-2.20

def test_individual_para_conjunta_e_aporte_e_individual_para_individual_nao(par):
    a = par["a"]
    aporte = _transferir(a, par["conta_a"], par["conjunta"]).json()
    entre_individuais = _transferir(a, par["conta_a"], par["conta_b"]).json()
    assert aporte["aporte"] is True
    assert entre_individuais["aporte"] is False
    lista = {x["id"]: x["aporte"] for x in a.get("/api/lancamentos", params={"mes": "2026-03"}).json()}
    assert lista == {aporte["id"]: True, entre_individuais["id"]: False}


def test_conjunta_para_individual_nao_e_aporte(par):
    criada = _transferir(par["a"], par["conjunta"], par["conta_a"]).json()
    assert criada["aporte"] is False


def test_despesa_nao_e_aporte(par):
    a = par["a"]
    r = a.post(
        "/api/lancamentos",
        json={
            "tipo": "despesa", "valor": "10.00", "data": "2026-03-10", "descricao": "x",
            "categoria_id": _categoria(a, "Mercado"), "dono_usuario_id": par["casal"].a.id,
            "conta_id": par["conta_a"],
        },
    )
    assert r.json()["aporte"] is False


# ------------------------------------------------------------------ CA-2.21

def _arquivar(cliente, conta_id):
    r = cliente.post(f"/api/contas/{conta_id}/arquivar")
    assert r.status_code == 200, r.text


def _despesa(cliente, conta_id, dono):
    return cliente.post(
        "/api/lancamentos",
        json={
            "tipo": "despesa", "valor": "10.00", "data": "2026-03-10", "descricao": "x",
            "categoria_id": _categoria(cliente, "Mercado"), "dono_usuario_id": dono,
            "conta_id": conta_id,
        },
    )


def _receita(cliente, conta_id, dono):
    return cliente.post(
        "/api/lancamentos",
        json={
            "tipo": "receita", "valor": "10.00", "data": "2026-03-10", "descricao": "x",
            "categoria_id": _categoria(cliente, "Salário", "receita"),
            "dono_usuario_id": dono, "conta_id": conta_id,
        },
    )


def _recusado(r):
    assert r.status_code == 409, r.text
    assert r.json()["erro"]["codigo"] == "CONTA_ARQUIVADA"
    assert r.json()["erro"]["mensagem"]


def test_despesa_e_receita_em_conta_arquivada_sao_recusadas(par):
    a, id_a = par["a"], par["casal"].a.id
    _arquivar(a, par["conta_a"])
    _recusado(_despesa(a, par["conta_a"], id_a))
    _recusado(_receita(a, par["conta_a"], id_a))


def test_transferencia_com_origem_arquivada_e_recusada(par):
    a = par["a"]
    _arquivar(a, par["conta_a"])
    _recusado(_transferir(a, par["conta_a"], par["conjunta"]))


def test_transferencia_com_destino_arquivado_e_recusada(par):
    a = par["a"]
    _arquivar(a, par["conta_a"])
    _recusado(_transferir(a, par["conjunta"], par["conta_a"]))


def test_recusa_nao_cria_lancamento_e_desarquivar_libera_a_criacao(par):
    a, id_a = par["a"], par["casal"].a.id
    _arquivar(a, par["conta_a"])
    _recusado(_despesa(a, par["conta_a"], id_a))
    assert a.get("/api/lancamentos", params={"mes": "2026-03"}).json() == []
    assert a.post(f"/api/contas/{par['conta_a']}/desarquivar").status_code == 200
    assert _despesa(a, par["conta_a"], id_a).status_code == 201


def test_confirmar_e_excluir_em_conta_arquivada_sao_recusados(par):
    a, id_a = par["a"], par["casal"].a.id
    prevista = _despesa(a, par["conta_a"], id_a).json()
    a.patch(f"/api/lancamentos/{prevista['id']}", json={"situacao": "prevista", "data": "2026-03-20"})
    _arquivar(a, par["conta_a"])
    _recusado(a.post(f"/api/lancamentos/{prevista['id']}/confirmar"))
    _recusado(a.delete(f"/api/lancamentos/{prevista['id']}"))
    assert a.get(f"/api/lancamentos/{prevista['id']}").status_code == 200


def test_editar_transferencia_cuja_origem_foi_arquivada_e_recusado(par):
    a = par["a"]
    criada = _transferir(a, par["conta_a"], par["conjunta"]).json()
    _arquivar(a, par["conta_a"])
    _recusado(a.patch(f"/api/lancamentos/{criada['id']}", json={"valor": "1.00"}))
    _recusado(
        a.patch(f"/api/lancamentos/{criada['id']}", json={"conta_id": par["conta_b"]})
    )
    assert a.get(f"/api/lancamentos/{criada['id']}").json()["valor"] == "200.00"
