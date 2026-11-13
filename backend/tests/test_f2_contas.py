"""Fatia 2: contas (CA-2.01 a CA-2.06, CA-N.02), arquivar e nome da conta individual (D-031)."""
from datetime import date
from decimal import Decimal

import pytest

HOJE = date(2026, 3, 15)


def _contas(cliente, **params):
    r = cliente.get("/api/contas", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def _categoria(cliente, nome: str, tipo: str = "despesa") -> int:
    """Id da (sub)categoria padrão com este nome."""
    r = cliente.get("/api/categorias", params={"tipo": tipo})
    assert r.status_code == 200, r.text
    for raiz in r.json():
        if raiz["nome"] == nome:
            return raiz["id"]
        for sub in raiz["subcategorias"]:
            if sub["nome"] == nome:
                return sub["id"]
    raise AssertionError(f"categoria {nome!r} não encontrada")


def _lancar(cliente, conta_id, valor, *, tipo="despesa", data="2026-03-10", situacao=None,
            categoria="Mercado"):
    dono = cliente.get(f"/api/contas/{conta_id}").json()["dono_usuario_id"]
    corpo = {
        "tipo": tipo,
        "valor": valor,
        "data": data,
        "descricao": "teste",
        "categoria_id": _categoria(cliente, categoria, tipo),
        "dono_usuario_id": dono,
        "conta_id": conta_id,
    }
    if situacao:
        corpo["situacao"] = situacao
    r = cliente.post("/api/lancamentos", json=corpo)
    assert r.status_code == 201, r.text
    return r.json()


def _receita(cliente, conta_id, valor):
    return _lancar(cliente, conta_id, valor, tipo="receita", categoria="Salário")


def _conta_individual(cliente, pessoa_id):
    return next(c for c in _contas(cliente)["contas"] if c["dono_usuario_id"] == pessoa_id)


# ------------------------------------------------------------------ CA-2.01

def test_pessoa_sem_vinculo_tem_uma_conta_individual_e_lanca_despesa(fab, relogio):
    relogio(HOJE)
    p = fab.uma_pessoa("Ana")
    dados = _contas(p.cliente)
    assert len(dados["contas"]) == 1
    conta = dados["contas"][0]
    assert conta["dono_usuario_id"] == p.id
    assert conta["nome"] == "Conta de Ana"
    assert conta["saldo_atual"] == "0.00"

    assert _categoria(p.cliente, "Mercado")  # lista padrão existe
    lanc = _lancar(p.cliente, conta["id"], "50.00")
    assert lanc["valor"] == "50.00"
    assert lanc["categoria"]["nome"] == "Mercado"
    assert _contas(p.cliente)["contas"][0]["saldo_atual"] == "-50.00"


def test_casal_vinculado_tem_exatamente_tres_contas_com_donos_corretos(fab):
    c = fab.um_casal("Ana", "Beto")
    for cliente in (c.a.cliente, c.b.cliente):
        contas = _contas(cliente)["contas"]
        assert len(contas) == 3
        donos = sorted((x["dono_usuario_id"] or 0) for x in contas)
        assert donos == sorted([0, c.a.id, c.b.id])
        conjuntas = [x for x in contas if x["dono_usuario_id"] is None]
        assert len(conjuntas) == 1
        assert not conjuntas[0]["casal_encerrado"]


def test_editar_nome_instituicao_tipo_e_cor_de_cada_conta(fab):
    c = fab.um_casal()
    for conta in _contas(c.a.cliente)["contas"]:
        r = c.a.cliente.patch(
            f"/api/contas/{conta['id']}",
            json={"nome": "Nova", "instituicao": "Nubank", "tipo": "poupanca", "cor": "#1E88E5"},
        )
        assert r.status_code == 200, r.text
        corpo = r.json()
        assert (corpo["nome"], corpo["instituicao"], corpo["tipo"], corpo["cor"]) == (
            "Nova", "Nubank", "poupanca", "#1E88E5")
        assert corpo["dono_usuario_id"] == conta["dono_usuario_id"]


def test_patch_nao_muda_dono(fab):
    p = fab.uma_pessoa()
    outro = fab.uma_pessoa()
    conta = _contas(p.cliente)["contas"][0]
    r = p.cliente.patch(f"/api/contas/{conta['id']}", json={"usuario_id": outro.id})
    assert r.status_code == 200
    assert r.json()["dono_usuario_id"] == p.id


def test_nao_existe_rota_para_criar_nem_excluir_conta(fab):
    c = fab.um_casal()
    conta = _contas(c.a.cliente)["contas"][0]
    corpo = {"nome": "Quarta", "tipo": "outros", "cor": "#000000"}
    assert c.a.cliente.post("/api/contas", json=corpo).status_code == 405
    assert c.a.cliente.delete(f"/api/contas/{conta['id']}").status_code == 405
    assert len(_contas(c.a.cliente)["contas"]) == 3


@pytest.mark.parametrize(
    "corpo",
    [
        {"tipo": "invalido"},
        {"cor": "azul"},
        {"cor": "#12345"},
        {"nome": ""},
        {"nome": "x" * 61},
        {"nome": None},
        {"saldo_inicial": "1,5"},
    ],
)
def test_patch_conta_com_valor_invalido_responde_422(fab, corpo):
    p = fab.uma_pessoa()
    conta = _contas(p.cliente)["contas"][0]
    r = p.cliente.patch(f"/api/contas/{conta['id']}", json=corpo)
    assert r.status_code == 422, r.text


# ------------------------------------------------------------------ CA-2.02

def test_saldo_inicial_positivo_aparece_como_saldo_atual(fab):
    p = fab.uma_pessoa()
    conta = _contas(p.cliente)["contas"][0]
    r = p.cliente.patch(f"/api/contas/{conta['id']}", json={"saldo_inicial": "1000.00"})
    assert r.status_code == 200
    assert r.json()["saldo_inicial"] == "1000.00"
    assert r.json()["saldo_atual"] == "1000.00"


def test_saldo_inicial_negativo_e_aceito_e_exibido(fab):
    p = fab.uma_pessoa()
    conta = _contas(p.cliente)["contas"][0]
    r = p.cliente.patch(f"/api/contas/{conta['id']}", json={"saldo_inicial": "-50.00"})
    assert r.status_code == 200
    assert r.json()["saldo_atual"] == "-50.00"
    assert p.cliente.get(f"/api/contas/{conta['id']}").json()["saldo_atual"] == "-50.00"


def test_editar_saldo_inicial_atualiza_saldo_atual(fab):
    p = fab.uma_pessoa()
    conta = _contas(p.cliente)["contas"][0]
    p.cliente.patch(f"/api/contas/{conta['id']}", json={"saldo_inicial": "1000.00"})
    r = p.cliente.patch(f"/api/contas/{conta['id']}", json={"saldo_inicial": "800.00"})
    assert r.json()["saldo_atual"] == "800.00"


# ------------------------------------------------------------------ CA-2.03

def test_saldo_atual_e_previsto_e_confirmacao_da_prevista(fab, relogio):
    relogio(HOJE)
    p = fab.uma_pessoa()
    conta = _contas(p.cliente)["contas"][0]
    p.cliente.patch(f"/api/contas/{conta['id']}", json={"saldo_inicial": "1000.00"})
    _lancar(p.cliente, conta["id"], "100.00", data="2026-03-10", situacao="confirmada")
    prevista = _lancar(p.cliente, conta["id"], "50.00", data="2026-03-20", situacao="prevista")

    c = p.cliente.get(f"/api/contas/{conta['id']}").json()
    assert (c["saldo_atual"], c["saldo_previsto"]) == ("900.00", "850.00")

    r = p.cliente.post(f"/api/lancamentos/{prevista['id']}/confirmar")
    assert r.status_code == 200, r.text
    c = p.cliente.get(f"/api/contas/{conta['id']}").json()
    assert (c["saldo_atual"], c["saldo_previsto"]) == ("850.00", "850.00")


def test_previsto_do_mes_inclui_atrasadas_e_exclui_meses_futuros(fab, relogio):
    relogio(HOJE)
    p = fab.uma_pessoa()
    conta = _contas(p.cliente)["contas"][0]
    _lancar(p.cliente, conta["id"], "10.00", data="2026-02-01", situacao="prevista")  # atrasada
    _lancar(p.cliente, conta["id"], "20.00", data="2026-03-31", situacao="prevista")  # fim do mês
    _lancar(p.cliente, conta["id"], "40.00", data="2026-04-01", situacao="prevista")  # mês seguinte

    marco = p.cliente.get(f"/api/contas/{conta['id']}", params={"mes": "2026-03"}).json()
    abril = p.cliente.get(f"/api/contas/{conta['id']}", params={"mes": "2026-04"}).json()
    assert marco["saldo_atual"] == "0.00"
    assert marco["saldo_previsto"] == "-30.00"
    assert abril["saldo_previsto"] == "-70.00"


def test_transferencia_debita_origem_e_credita_destino_e_receita_soma(fab, relogio):
    relogio(HOJE)
    c = fab.um_casal()
    contas = _contas(c.a.cliente)["contas"]
    minha = next(x for x in contas if x["dono_usuario_id"] == c.a.id)
    conjunta = next(x for x in contas if x["dono_usuario_id"] is None)
    _receita(c.a.cliente, minha["id"], "300.00")
    r = c.a.cliente.post(
        "/api/lancamentos",
        json={"tipo": "transferencia", "valor": "120.00", "data": "2026-03-10",
              "conta_id": minha["id"], "conta_destino_id": conjunta["id"]},
    )
    assert r.status_code == 201, r.text
    saldos = {x["id"]: x["saldo_atual"] for x in _contas(c.a.cliente)["contas"]}
    assert saldos[minha["id"]] == "180.00"
    assert saldos[conjunta["id"]] == "120.00"


# ------------------------------------------------------------------ CA-2.04 / CA-N.02

def test_somar_receitas_de_dez_e_vinte_centavos_da_trinta_centavos(fab, relogio):
    relogio(HOJE)
    p = fab.uma_pessoa()
    conta = _contas(p.cliente)["contas"][0]
    _receita(p.cliente, conta["id"], "0.10")
    _receita(p.cliente, conta["id"], "0.20")
    dados = _contas(p.cliente)
    assert dados["contas"][0]["saldo_atual"] == "0.30"
    assert dados["total_saldo_atual"] == "0.30"
    assert dados["total_saldo_previsto"] == "0.30"


# ------------------------------------------------------------------ CA-2.05

def test_arquivar_move_para_arquivadas_e_desarquivar_devolve(fab):
    p = fab.uma_pessoa()
    conta = _contas(p.cliente)["contas"][0]
    r = p.cliente.post(f"/api/contas/{conta['id']}/arquivar")
    assert r.status_code == 200 and r.json()["arquivado"] is True

    assert _contas(p.cliente)["contas"] == []
    arq = _contas(p.cliente, arquivadas="true")
    assert [x["id"] for x in arq["contas"]] == [conta["id"]]
    assert arq["total_saldo_atual"] is None and arq["total_saldo_previsto"] is None

    r = p.cliente.post(f"/api/contas/{conta['id']}/desarquivar")
    assert r.status_code == 200 and r.json()["arquivado"] is False
    assert [x["id"] for x in _contas(p.cliente)["contas"]] == [conta["id"]]
    assert _contas(p.cliente, arquivadas="true")["contas"] == []


def test_arquivar_e_desarquivar_sao_idempotentes(fab):
    p = fab.uma_pessoa()
    conta = _contas(p.cliente)["contas"][0]
    for _ in range(2):
        assert p.cliente.post(f"/api/contas/{conta['id']}/arquivar").status_code == 200
    for _ in range(2):
        assert p.cliente.post(f"/api/contas/{conta['id']}/desarquivar").status_code == 200


def test_conta_arquivada_bloqueia_escrita_e_mantem_consulta(fab, relogio):
    relogio(HOJE)
    p = fab.uma_pessoa()
    conta = _contas(p.cliente)["contas"][0]
    existente = _lancar(p.cliente, conta["id"], "30.00", situacao="confirmada")
    prevista = _lancar(p.cliente, conta["id"], "5.00", data="2026-03-20", situacao="prevista")
    p.cliente.post(f"/api/contas/{conta['id']}/arquivar")

    cat = _categoria(p.cliente, "Mercado")
    novo = {"tipo": "despesa", "valor": "1.00", "data": "2026-03-10", "descricao": "x",
            "categoria_id": cat, "conta_id": conta["id"], "dono_usuario_id": p.id}
    r = p.cliente.post("/api/lancamentos", json=novo)
    assert (r.status_code, r.json()["erro"]["codigo"]) == (409, "CONTA_ARQUIVADA")
    r = p.cliente.patch(f"/api/lancamentos/{existente['id']}", json={"valor": "31.00"})
    assert (r.status_code, r.json()["erro"]["codigo"]) == (409, "CONTA_ARQUIVADA")
    r = p.cliente.delete(f"/api/lancamentos/{existente['id']}")
    assert (r.status_code, r.json()["erro"]["codigo"]) == (409, "CONTA_ARQUIVADA")
    r = p.cliente.post(f"/api/lancamentos/{prevista['id']}/confirmar")
    assert (r.status_code, r.json()["erro"]["codigo"]) == (409, "CONTA_ARQUIVADA")
    r = p.cliente.patch(f"/api/contas/{conta['id']}", json={"nome": "Outro"})
    assert (r.status_code, r.json()["erro"]["codigo"]) == (409, "CONTA_ARQUIVADA")

    # consulta continua: lançamentos e saldo
    r = p.cliente.get("/api/lancamentos", params={"mes": "2026-03", "conta_id": conta["id"]})
    assert r.status_code == 200
    assert {x["id"] for x in r.json()} == {existente["id"], prevista["id"]}
    c = p.cliente.get(f"/api/contas/{conta['id']}").json()
    assert (c["saldo_atual"], c["arquivado"]) == ("-30.00", True)
    assert Decimal(c["saldo_previsto"]) == Decimal("-35.00")


# ------------------------------------------------------------------ CA-2.06

def test_totais_da_lista_sao_a_soma_dos_cards_das_contas_ativas(fab, relogio):
    relogio(HOJE)
    c = fab.um_casal()
    contas = _contas(c.a.cliente)["contas"]
    valores = ["100.10", "200.20", "300.30"]
    for conta, v in zip(contas, valores, strict=True):
        c.a.cliente.patch(f"/api/contas/{conta['id']}", json={"saldo_inicial": v})
    _lancar(c.a.cliente, contas[0]["id"], "0.05", data="2026-03-20", situacao="prevista")

    dados = _contas(c.a.cliente)
    assert len(dados["contas"]) == 3
    assert Decimal(dados["total_saldo_atual"]) == sum(Decimal(x["saldo_atual"]) for x in dados["contas"])
    assert Decimal(dados["total_saldo_previsto"]) == sum(
        Decimal(x["saldo_previsto"]) for x in dados["contas"])
    assert dados["total_saldo_atual"] == "600.60"
    assert dados["total_saldo_previsto"] == "600.55"

    # arquivada sai dos cards e dos totais
    c.a.cliente.post(f"/api/contas/{contas[2]['id']}/arquivar")
    dados = _contas(c.a.cliente)
    assert len(dados["contas"]) == 2
    assert dados["total_saldo_atual"] == "300.30"


def test_mes_invalido_na_lista_responde_422(fab):
    p = fab.uma_pessoa()
    assert p.cliente.get("/api/contas", params={"mes": "2026-13"}).status_code == 422


def test_conta_de_outro_casal_responde_404(fab):
    c1, c2 = fab.dois_casais()
    alheia = _contas(c2.a.cliente)["contas"][0]["id"]
    assert c1.a.cliente.get(f"/api/contas/{alheia}").status_code == 404
    assert c1.a.cliente.patch(f"/api/contas/{alheia}", json={"nome": "x"}).status_code == 404
    assert c1.a.cliente.post(f"/api/contas/{alheia}/arquivar").status_code == 404
    assert c1.a.cliente.post(f"/api/contas/{alheia}/reajuste", json={"saldo_real": "1.00"}
                             ).status_code == 404


# ------------------------------------------------------------------ D-031

def test_nome_da_conta_individual_e_cortado_em_60_com_usuario_de_80_caracteres(fab):
    nome = "A" * 80
    p = fab.uma_pessoa(nome)
    conta = _contas(p.cliente)["contas"][0]
    assert len(conta["nome"]) <= 60
    assert conta["nome"] == ("Conta de " + nome)[:60]


def test_nome_cortado_nao_termina_em_espaco(fab):
    # "Conta de " tem 9 caracteres; um espaço na posição 60 deve ser descartado.
    nome = "B" * 50 + " " + "C" * 29
    p = fab.uma_pessoa(nome)
    conta = _contas(p.cliente)["contas"][0]
    assert conta["nome"] == conta["nome"].rstrip()
    assert conta["nome"].startswith("Conta de BBB")
