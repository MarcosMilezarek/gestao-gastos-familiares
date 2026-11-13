"""Fatia 2: lançamentos de despesa e receita (CA-2.12 a CA-2.18) e bordas da t98 (S1)."""
from datetime import date

import pytest

HOJE = date(2026, 3, 15)
ONTEM = "2026-03-14"
AMANHA = "2026-03-16"


def _categoria(cliente, nome: str, tipo: str = "despesa") -> int:
    r = cliente.get("/api/categorias", params={"tipo": tipo})
    assert r.status_code == 200, r.text
    for raiz in r.json():
        for no in [raiz, *raiz["subcategorias"]]:
            if no["nome"] == nome:
                return no["id"]
    raise AssertionError(f"categoria {nome!r} não encontrada")


def _contas(cliente) -> list[dict]:
    r = cliente.get("/api/contas")
    assert r.status_code == 200, r.text
    return r.json()["contas"]


def _conta_de(cliente, dono_id):
    return next(c for c in _contas(cliente) if c["dono_usuario_id"] == dono_id)


def _corpo(cliente, conta_id, dono, **extra) -> dict:
    corpo = {
        "tipo": "despesa", "valor": "120.50", "data": "2026-03-10", "descricao": "Compra",
        "categoria_id": _categoria(cliente, "Mercado"),
        "dono_usuario_id": dono, "conta_id": conta_id,
    }
    corpo.update(extra)
    return corpo


def _criar(cliente, conta_id, dono, **extra) -> dict:
    r = cliente.post("/api/lancamentos", json=_corpo(cliente, conta_id, dono, **extra))
    assert r.status_code == 201, r.text
    return r.json()


def _saldo(cliente, conta_id) -> str:
    return cliente.get(f"/api/contas/{conta_id}").json()["saldo_atual"]


@pytest.fixture
def eu(fab, relogio):
    """Pessoa sozinha, com a conta individual, e o relógio em 2026-03-15."""
    relogio(HOJE)
    p = fab.uma_pessoa()
    return p, _conta_de(p.cliente, p.id)["id"]


# ------------------------------------------------------------------ CA-2.12

@pytest.mark.parametrize("valor", ["0", "0.00", "-1.00"])
def test_criar_despesa_com_valor_zero_ou_negativo_e_recusado(eu, valor):
    p, conta = eu
    r = p.cliente.post("/api/lancamentos", json=_corpo(p.cliente, conta, p.id, valor=valor))
    assert r.status_code == 422, r.text
    assert any(k.endswith("valor") for k in r.json()["erro"]["campos"])


def test_despesa_de_120_50_aparece_na_lista_do_mes_da_data(eu):
    p, conta = eu
    criada = _criar(p.cliente, conta, p.id)
    assert (criada["valor"], criada["data"], criada["descricao"]) == (
        "120.50", "2026-03-10", "Compra",
    )
    assert criada["categoria"]["nome"] == "Mercado"
    assert criada["dono_usuario_id"] == p.id and criada["conta_id"] == conta
    mes = p.cliente.get("/api/lancamentos", params={"mes": "2026-03"}).json()
    assert [x["id"] for x in mes] == [criada["id"]]
    outro = p.cliente.get("/api/lancamentos", params={"mes": "2026-02"}).json()
    assert outro == []


def test_criar_aceita_o_maior_valor_e_recusa_o_seguinte(eu):
    p, conta = eu
    assert p.cliente.post(
        "/api/lancamentos", json=_corpo(p.cliente, conta, p.id, valor="9999999999.99")
    ).status_code == 201
    r = p.cliente.post(
        "/api/lancamentos", json=_corpo(p.cliente, conta, p.id, valor="10000000000.00")
    )
    assert r.status_code == 422


def test_descricao_vazia_e_data_fora_do_intervalo_sao_recusadas(eu):
    p, conta = eu
    r = p.cliente.post("/api/lancamentos", json=_corpo(p.cliente, conta, p.id, descricao=" "))
    assert r.status_code == 422
    r = p.cliente.post("/api/lancamentos", json=_corpo(p.cliente, conta, p.id, data="1999-12-31"))
    assert r.status_code == 422 and "data" in r.json()["erro"]["campos"]
    r = p.cliente.post("/api/lancamentos", json=_corpo(p.cliente, conta, p.id, data="2036-03-16"))
    assert r.status_code == 422 and "data" in r.json()["erro"]["campos"]
    assert p.cliente.post(
        "/api/lancamentos", json=_corpo(p.cliente, conta, p.id, data="2036-03-15")
    ).status_code == 201


def test_categoria_de_receita_em_despesa_e_recusada(eu):
    p, conta = eu
    r = p.cliente.post(
        "/api/lancamentos",
        json=_corpo(p.cliente, conta, p.id, categoria_id=_categoria(p.cliente, "Salário", "receita")),
    )
    assert r.status_code == 409
    assert r.json()["erro"]["codigo"] == "CATEGORIA_TIPO_INVALIDO"


# ------------------------------------------------------------------ CA-2.13

def test_tags_e_observacao_voltam_ao_reabrir(eu):
    p, conta = eu
    t1 = p.cliente.post("/api/tags", json={"nome": "essencial"}).json()["id"]
    t2 = p.cliente.post("/api/tags", json={"nome": "mercado"}).json()["id"]
    criada = _criar(p.cliente, conta, p.id, tag_ids=[t1, t2], observacao="Compra do mês")
    lido = p.cliente.get(f"/api/lancamentos/{criada['id']}").json()
    assert sorted(t["nome"] for t in lido["tags"]) == ["essencial", "mercado"]
    assert lido["observacao"] == "Compra do mês"


def test_lancamento_sem_tags_nem_observacao_e_aceito(eu):
    p, conta = eu
    criada = _criar(p.cliente, conta, p.id)
    assert criada["tags"] == [] and criada["observacao"] is None


def test_tag_repetida_ou_inexistente_e_observacao_longa_sao_recusadas(eu):
    p, conta = eu
    t1 = p.cliente.post("/api/tags", json={"nome": "essencial"}).json()["id"]
    for extra in ({"tag_ids": [t1, t1]}, {"tag_ids": [999999]}, {"observacao": "x" * 501}):
        r = p.cliente.post("/api/lancamentos", json=_corpo(p.cliente, conta, p.id, **extra))
        assert r.status_code == 422, (extra, r.text)
    assert p.cliente.post(
        "/api/lancamentos", json=_corpo(p.cliente, conta, p.id, observacao="x" * 500)
    ).status_code == 201


# ------------------------------------------------------------------ CA-2.14

@pytest.fixture
def par(fab, relogio):
    relogio(HOJE)
    casal = fab.um_casal()
    a = casal.a.cliente
    return {
        "casal": casal,
        "a": a,
        "conta_a": _conta_de(a, casal.a.id)["id"],
        "conta_b": _conta_de(casal.b.cliente, casal.b.id)["id"],
        "conjunta": _conta_de(a, None)["id"],
    }


def test_dono_casal_com_conta_conjunta_e_aceito_e_dono_a_com_conta_de_a_tambem(par):
    a, id_a = par["a"], par["casal"].a.id
    assert _criar(a, par["conjunta"], None)["dono_usuario_id"] is None
    assert _criar(a, par["conta_a"], id_a)["dono_usuario_id"] == id_a


@pytest.mark.parametrize(
    ("dono", "conta"),
    [("b", "conta_a"), ("casal", "conta_a"), ("a", "conjunta"), ("a", "conta_b")],
)
def test_dono_incompativel_com_a_conta_e_recusado(par, dono, conta):
    ids = {"a": par["casal"].a.id, "b": par["casal"].b.id, "casal": None}
    r = par["a"].post(
        "/api/lancamentos", json=_corpo(par["a"], par[conta], ids[dono])
    )
    assert r.status_code == 409, r.text
    assert r.json()["erro"]["codigo"] == "DONO_CONTA_INCOMPATIVEL"
    assert "conta_id" in r.json()["erro"]["campos"]


def test_editar_para_dono_incompativel_e_recusado_e_nada_muda(par):
    id_a = par["casal"].a.id
    criada = _criar(par["a"], par["conta_a"], id_a)
    r = par["a"].patch(f"/api/lancamentos/{criada['id']}", json={"dono_usuario_id": None})
    assert r.status_code == 409
    assert r.json()["erro"]["codigo"] == "DONO_CONTA_INCOMPATIVEL"
    assert par["a"].get(f"/api/lancamentos/{criada['id']}").json()["dono_usuario_id"] == id_a


# ------------------------------------------------------------------ CA-2.15

@pytest.mark.parametrize(
    ("data", "esperada"),
    [("2026-03-15", "confirmada"), (ONTEM, "confirmada"), (AMANHA, "prevista")],
)
def test_situacao_omitida_depende_da_data_em_relacao_a_hoje(eu, data, esperada):
    p, conta = eu
    assert _criar(p.cliente, conta, p.id, data=data)["situacao"] == esperada


def test_escolha_manual_de_situacao_e_respeitada(eu):
    p, conta = eu
    futura = _criar(p.cliente, conta, p.id, data=AMANHA, situacao="confirmada")
    assert futura["situacao"] == "confirmada"
    passada = _criar(p.cliente, conta, p.id, data="2026-03-01", situacao="prevista")
    assert passada["situacao"] == "atrasada"  # prevista no passado é exibida como atrasada


def test_situacao_atrasada_nao_e_aceita_na_entrada(eu):
    p, conta = eu
    r = p.cliente.post(
        "/api/lancamentos", json=_corpo(p.cliente, conta, p.id, situacao="atrasada")
    )
    assert r.status_code == 422


# ------------------------------------------------------------------ CA-2.16

def test_confirmar_receita_prevista_com_valor_real_ajusta_valor_situacao_e_saldo(eu):
    p, conta = eu
    cat = _categoria(p.cliente, "Salário", "receita")
    prevista = _criar(
        p.cliente, conta, p.id, tipo="receita", valor="3000.00", descricao="Salário",
        categoria_id=cat, data=AMANHA,
    )
    assert prevista["situacao"] == "prevista"
    antes = _saldo(p.cliente, conta)
    r = p.cliente.post(f"/api/lancamentos/{prevista['id']}/confirmar", json={"valor": "3150.00"})
    assert r.status_code == 200, r.text
    assert (r.json()["valor"], r.json()["situacao"]) == ("3150.00", "confirmada")
    # a confirmação soma os 3.150,00 reais (a previsão de 3.000,00 não entrava no saldo atual)
    from decimal import Decimal
    assert Decimal(_saldo(p.cliente, conta)) - Decimal(antes) == Decimal("3150.00")


def test_confirmar_sem_corpo_mantem_o_valor_previsto(eu):
    p, conta = eu
    prevista = _criar(p.cliente, conta, p.id, valor="80.00", data=ONTEM, situacao="prevista")
    r = p.cliente.post(f"/api/lancamentos/{prevista['id']}/confirmar")
    assert r.status_code == 200, r.text
    assert (r.json()["valor"], r.json()["situacao"]) == ("80.00", "confirmada")


def test_confirmar_duas_vezes_recusa_a_segunda(eu):
    p, conta = eu
    prevista = _criar(p.cliente, conta, p.id, data=AMANHA)
    assert p.cliente.post(f"/api/lancamentos/{prevista['id']}/confirmar").status_code == 200
    r = p.cliente.post(f"/api/lancamentos/{prevista['id']}/confirmar")
    assert r.status_code == 409
    assert r.json()["erro"]["codigo"] == "LANCAMENTO_JA_CONFIRMADO"


@pytest.mark.parametrize("valor", ["0.00", "-5.00"])
def test_confirmar_com_valor_real_zero_ou_negativo_e_recusado(eu, valor):
    p, conta = eu
    prevista = _criar(p.cliente, conta, p.id, data=AMANHA)
    r = p.cliente.post(f"/api/lancamentos/{prevista['id']}/confirmar", json={"valor": valor})
    assert r.status_code == 422
    assert p.cliente.get(f"/api/lancamentos/{prevista['id']}").json()["situacao"] == "prevista"


# ------------------------------------------------------------------ CA-2.17

def test_prevista_de_ontem_e_atrasada_a_de_amanha_nao_e(eu):
    p, conta = eu
    ontem = _criar(p.cliente, conta, p.id, data=ONTEM, situacao="prevista")
    amanha = _criar(p.cliente, conta, p.id, data=AMANHA)
    hoje = _criar(p.cliente, conta, p.id, data="2026-03-15", situacao="prevista")
    assert ontem["situacao"] == "atrasada"
    assert amanha["situacao"] == "prevista"
    assert hoje["situacao"] == "prevista"


def test_confirmar_a_atrasada_deixa_de_ser_atrasada(eu):
    p, conta = eu
    ontem = _criar(p.cliente, conta, p.id, data=ONTEM, situacao="prevista")
    r = p.cliente.post(f"/api/lancamentos/{ontem['id']}/confirmar")
    assert r.json()["situacao"] == "confirmada"
    lista = p.cliente.get("/api/lancamentos", params={"mes": "2026-03"}).json()
    assert [x["situacao"] for x in lista] == ["confirmada"]


# ------------------------------------------------------------------ CA-2.18

def test_editar_valor_de_100_para_80_aumenta_20_no_saldo_e_excluir_devolve_os_80(eu):
    from decimal import Decimal

    p, conta = eu
    inicial = Decimal(_saldo(p.cliente, conta))
    criada = _criar(p.cliente, conta, p.id, valor="100.00")
    assert Decimal(_saldo(p.cliente, conta)) == inicial - 100
    r = p.cliente.patch(f"/api/lancamentos/{criada['id']}", json={"valor": "80.00"})
    assert r.status_code == 200, r.text
    assert r.json()["valor"] == "80.00"
    assert Decimal(_saldo(p.cliente, conta)) == inicial - 80
    assert p.cliente.delete(f"/api/lancamentos/{criada['id']}").status_code == 204
    assert Decimal(_saldo(p.cliente, conta)) == inicial
    assert p.cliente.get(f"/api/lancamentos/{criada['id']}").status_code == 404
    assert p.cliente.get("/api/lancamentos", params={"mes": "2026-03"}).json() == []


def test_excluir_lancamento_com_tags_remove_o_vinculo_e_preserva_a_tag(eu):
    p, conta = eu
    tag = p.cliente.post("/api/tags", json={"nome": "essencial"}).json()["id"]
    criada = _criar(p.cliente, conta, p.id, tag_ids=[tag])
    assert p.cliente.delete(f"/api/lancamentos/{criada['id']}").status_code == 204
    assert any(t["id"] == tag for t in p.cliente.get("/api/tags").json())


def test_editar_para_valor_zero_ou_negativo_e_recusado(eu):
    p, conta = eu
    criada = _criar(p.cliente, conta, p.id)
    for valor in ("0.00", "-1.00"):
        assert p.cliente.patch(
            f"/api/lancamentos/{criada['id']}", json={"valor": valor}
        ).status_code == 422
    assert p.cliente.get(f"/api/lancamentos/{criada['id']}").json()["valor"] == "120.50"


def test_editar_confirmada_para_data_futura_mantem_a_situacao_enviada(eu):
    p, conta = eu
    criada = _criar(p.cliente, conta, p.id)
    r = p.cliente.patch(
        f"/api/lancamentos/{criada['id']}", json={"data": AMANHA, "situacao": "prevista"}
    )
    assert r.status_code == 200, r.text
    assert (r.json()["data"], r.json()["situacao"]) == (AMANHA, "prevista")


def test_lancamento_de_outro_casal_da_404_em_ler_editar_confirmar_e_excluir(fab, relogio):
    relogio(HOJE)
    a, b = fab.dois_casais()
    conta = _conta_de(a.a.cliente, a.a.id)["id"]
    criada = _criar(a.a.cliente, conta, a.a.id, data=AMANHA)
    c = b.a.cliente
    assert c.get(f"/api/lancamentos/{criada['id']}").status_code == 404
    assert c.patch(f"/api/lancamentos/{criada['id']}", json={"valor": "1.00"}).status_code == 404
    assert c.post(f"/api/lancamentos/{criada['id']}/confirmar").status_code == 404
    assert c.delete(f"/api/lancamentos/{criada['id']}").status_code == 404
    assert a.a.cliente.get(f"/api/lancamentos/{criada['id']}").status_code == 200


# ------------------------------------------------------------------ t98 S1 e reajuste

def test_edicao_sem_tags_nem_categoria_mantem_ambas(eu):
    p, conta = eu
    tag = p.cliente.post("/api/tags", json={"nome": "essencial"}).json()["id"]
    criada = _criar(p.cliente, conta, p.id, tag_ids=[tag])
    r = p.cliente.patch(f"/api/lancamentos/{criada['id']}", json={"descricao": "Outra"})
    assert r.status_code == 200, r.text
    assert [t["id"] for t in r.json()["tags"]] == [tag]
    assert r.json()["categoria"]["id"] == criada["categoria"]["id"]


def test_enviar_tag_ids_vazio_remove_as_tags(eu):
    p, conta = eu
    tag = p.cliente.post("/api/tags", json={"nome": "essencial"}).json()["id"]
    criada = _criar(p.cliente, conta, p.id, tag_ids=[tag])
    r = p.cliente.patch(f"/api/lancamentos/{criada['id']}", json={"tag_ids": []})
    assert r.status_code == 200 and r.json()["tags"] == []


def test_edicao_mantem_categoria_apos_a_categoria_ser_renomeada_e_tag_apos_renomear(eu):
    p, conta = eu
    tag = p.cliente.post("/api/tags", json={"nome": "essencial"}).json()["id"]
    criada = _criar(p.cliente, conta, p.id, tag_ids=[tag])
    assert p.cliente.patch(f"/api/tags/{tag}", json={"nome": "básico"}).status_code == 200
    r = p.cliente.patch(f"/api/lancamentos/{criada['id']}", json={"valor": "10.00"})
    assert r.status_code == 200, r.text
    assert [t["nome"] for t in r.json()["tags"]] == ["básico"]


def test_reajuste_usa_o_saldo_depois_de_editar_e_excluir_lancamento(eu):
    p, conta = eu
    p.cliente.patch(f"/api/contas/{conta}", json={"saldo_inicial": "1000.00"})
    criada = _criar(p.cliente, conta, p.id, valor="100.00")
    p.cliente.patch(f"/api/lancamentos/{criada['id']}", json={"valor": "80.00"})
    r = p.cliente.post(f"/api/contas/{conta}/reajuste", json={"saldo_real": "950.00"})
    assert r.status_code == 200, r.text
    assert r.json()["lancamento"]["valor"] == "30.00"  # 950 - (1000 - 80)
    p.cliente.delete(f"/api/lancamentos/{criada['id']}")
    assert _saldo(p.cliente, conta) == "1030.00"
