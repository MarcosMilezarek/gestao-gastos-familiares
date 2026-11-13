"""Fatias 1 e 2: isolamento entre casais (CA-2.22, CA-N.05) por identificador direto, com MySQL real."""
from datetime import date

import pytest

HOJE = date(2026, 3, 15)


class _Alheio:
    """Identificadores de dados do casal 2, criados pelas rotas reais."""


def _montar_casal_2(c2):
    a2 = c2.a.cliente
    contas = a2.get("/api/contas").json()["contas"]
    alheio = _Alheio()
    alheio.conjunta = next(c for c in contas if c["dono_usuario_id"] is None)
    alheio.individual = next(c for c in contas if c["dono_usuario_id"] == c2.a.id)
    r = a2.post(
        "/api/categorias",
        json={"tipo": "despesa", "nome": "Segredo", "icone": "house", "cor": "#112233"},
    )
    assert r.status_code == 201, r.text
    alheio.categoria = r.json()
    r = a2.post("/api/tags", json={"nome": "segredo"})
    assert r.status_code == 201, r.text
    alheio.tag = r.json()

    def lancar(conta, dono):
        r = a2.post(
            "/api/lancamentos",
            json={
                "tipo": "despesa", "valor": "10.00", "data": "2026-03-10", "descricao": "alheio",
                "categoria_id": alheio.categoria["id"], "dono_usuario_id": dono,
                "conta_id": conta["id"], "tag_ids": [alheio.tag["id"]],
            },
        )
        assert r.status_code == 201, r.text
        return r.json()

    alheio.lanc_conjunta = lancar(alheio.conjunta, None)
    alheio.lanc_individual = lancar(alheio.individual, c2.a.id)
    return alheio


@pytest.fixture
def cenario(fab, relogio):
    relogio(HOJE)
    c1, c2 = fab.dois_casais()
    return c1, c2, _montar_casal_2(c2)


def _nao_encontrado(r):
    assert r.status_code == 404, r.text
    assert r.json()["erro"]["codigo"] == "NAO_ENCONTRADO"


# ---------------------------------------------------------------- listas

def test_listas_do_casal_1_nao_trazem_nada_do_casal_2(cenario):
    c1, _, alheio = cenario
    for pessoa in (c1.a, c1.b):
        cli = pessoa.cliente
        ids_contas = {c["id"] for c in cli.get("/api/contas").json()["contas"]}
        assert not ids_contas & {alheio.conjunta["id"], alheio.individual["id"]}
        ids_contas_arq = {
            c["id"] for c in cli.get("/api/contas", params={"arquivadas": True}).json()["contas"]
        }
        assert not ids_contas_arq & {alheio.conjunta["id"], alheio.individual["id"]}
        for tipo in ("despesa", "receita"):
            r = cli.get("/api/categorias", params={"tipo": tipo, "incluir_arquivadas": True})
            nomes = [c["nome"] for c in r.json()]
            assert "Segredo" not in nomes
        assert "segredo" not in [t["nome"] for t in cli.get("/api/tags").json()]
        lancs = cli.get("/api/lancamentos", params={"mes": "2026-03"}).json()
        assert lancs == []


def test_lista_de_lancamentos_filtrada_por_conta_alheia_nao_vaza(cenario):
    c1, _, alheio = cenario
    r = c1.a.cliente.get(
        "/api/lancamentos", params={"mes": "2026-03", "conta_id": alheio.conjunta["id"]}
    )
    assert r.status_code in (200, 404), r.text
    if r.status_code == 200:
        assert r.json() == []


def test_vinculo_do_casal_1_nao_mostra_convites_do_casal_2(cenario):
    c1, _, _ = cenario
    r = c1.a.cliente.get("/api/vinculo")
    assert r.status_code == 200, r.text
    assert r.json()["convite_enviado"] is None
    assert r.json()["convites_recebidos"] == []


# ---------------------------------------------------------------- contas

@pytest.mark.parametrize("qual", ["conjunta", "individual"])
def test_conta_alheia_por_id_e_404_ao_ler(cenario, qual):
    c1, _, alheio = cenario
    _nao_encontrado(c1.a.cliente.get(f"/api/contas/{getattr(alheio, qual)['id']}"))


@pytest.mark.parametrize(
    ("metodo", "sufixo", "corpo"),
    [
        ("patch", "", {"nome": "invadida"}),
        ("post", "/arquivar", None),
        ("post", "/desarquivar", None),
        ("post", "/reajuste", {"saldo_real": "5.00"}),
    ],
)
def test_conta_alheia_por_id_e_404_ao_alterar(cenario, metodo, sufixo, corpo):
    c1, _, alheio = cenario
    r = getattr(c1.a.cliente, metodo)(f"/api/contas/{alheio.conjunta['id']}{sufixo}", json=corpo)
    _nao_encontrado(r)


def test_conta_alheia_nao_muda_depois_das_tentativas(cenario):
    c1, c2, alheio = cenario
    c1.a.cliente.patch(f"/api/contas/{alheio.conjunta['id']}", json={"nome": "invadida"})
    c1.a.cliente.post(f"/api/contas/{alheio.conjunta['id']}/arquivar")
    conta = c2.a.cliente.get(f"/api/contas/{alheio.conjunta['id']}").json()
    assert conta["nome"] == alheio.conjunta["nome"]
    assert conta["arquivado"] is False


# ---------------------------------------------------------------- categorias

@pytest.mark.parametrize(
    ("metodo", "sufixo", "corpo"),
    [
        ("patch", "", {"nome": "Invadida"}),
        ("post", "/arquivar", {}),
    ],
)
def test_categoria_alheia_por_id_e_404_ao_alterar(cenario, metodo, sufixo, corpo):
    c1, _, alheio = cenario
    r = getattr(c1.a.cliente, metodo)(
        f"/api/categorias/{alheio.categoria['id']}{sufixo}", json=corpo
    )
    _nao_encontrado(r)


def test_mover_lancamentos_de_categoria_alheia_e_404(cenario):
    c1, _, alheio = cenario
    propria = next(
        c for c in c1.a.cliente.get("/api/categorias", params={"tipo": "despesa"}).json()
    )
    r = c1.a.cliente.post(
        f"/api/categorias/{alheio.categoria['id']}/mover-lancamentos",
        json={"destino_id": propria["id"]},
    )
    _nao_encontrado(r)


def test_mover_lancamentos_para_categoria_alheia_e_recusado(cenario):
    c1, _, alheio = cenario
    propria = next(
        c for c in c1.a.cliente.get("/api/categorias", params={"tipo": "despesa"}).json()
    )
    r = c1.a.cliente.post(
        f"/api/categorias/{propria['id']}/mover-lancamentos",
        json={"destino_id": alheio.categoria["id"]},
    )
    assert r.status_code in (404, 422), r.text


def test_categoria_alheia_nao_muda_depois_das_tentativas(cenario):
    c1, c2, alheio = cenario
    c1.a.cliente.patch(f"/api/categorias/{alheio.categoria['id']}", json={"nome": "Invadida"})
    c1.a.cliente.post(f"/api/categorias/{alheio.categoria['id']}/arquivar", json={})
    cat = next(
        c for c in c2.a.cliente.get("/api/categorias", params={"tipo": "despesa"}).json()
        if c["id"] == alheio.categoria["id"]
    )
    assert cat["nome"] == "Segredo" and cat["arquivado"] is False


def test_subcategoria_sob_pai_alheio_e_recusada(cenario):
    c1, _, alheio = cenario
    r = c1.a.cliente.post(
        "/api/categorias",
        json={
            "tipo": "despesa", "nome": "Filha", "icone": "house",
            "categoria_pai_id": alheio.categoria["id"],
        },
    )
    assert r.status_code == 422, r.text


# ---------------------------------------------------------------- tags

def test_tag_alheia_por_id_e_404_ao_renomear_e_ao_excluir(cenario):
    c1, c2, alheio = cenario
    _nao_encontrado(c1.a.cliente.patch(f"/api/tags/{alheio.tag['id']}", json={"nome": "x"}))
    _nao_encontrado(c1.a.cliente.delete(f"/api/tags/{alheio.tag['id']}"))
    assert alheio.tag["id"] in [t["id"] for t in c2.a.cliente.get("/api/tags").json()]


# ---------------------------------------------------------------- lançamentos

@pytest.mark.parametrize("qual", ["lanc_conjunta", "lanc_individual"])
def test_lancamento_alheio_por_id_e_404_ao_ler(cenario, qual):
    c1, _, alheio = cenario
    _nao_encontrado(c1.a.cliente.get(f"/api/lancamentos/{getattr(alheio, qual)['id']}"))


@pytest.mark.parametrize("qual", ["lanc_conjunta", "lanc_individual"])
@pytest.mark.parametrize(
    ("metodo", "sufixo", "corpo"),
    [
        ("patch", "", {"descricao": "invadido"}),
        ("delete", "", None),
        ("post", "/confirmar", {}),
    ],
)
def test_lancamento_alheio_por_id_e_404_ao_alterar(cenario, qual, metodo, sufixo, corpo):
    c1, c2, alheio = cenario
    lid = getattr(alheio, qual)["id"]
    kw = {} if corpo is None else {"json": corpo}
    r = getattr(c1.a.cliente, metodo)(f"/api/lancamentos/{lid}{sufixo}", **kw)
    _nao_encontrado(r)
    intacto = c2.a.cliente.get(f"/api/lancamentos/{lid}").json()
    assert intacto["descricao"] == "alheio"


def test_criar_lancamento_em_conta_ou_categoria_alheia_e_recusado(cenario):
    c1, _, alheio = cenario
    propria = c1.a.cliente.get("/api/contas").json()["contas"][0]
    propria_cat = c1.a.cliente.get("/api/categorias", params={"tipo": "despesa"}).json()[0]

    def corpo(**mudancas):
        base = {
            "tipo": "despesa", "valor": "1.00", "data": "2026-03-10", "descricao": "x",
            "categoria_id": propria_cat["id"], "dono_usuario_id": propria["dono_usuario_id"],
            "conta_id": propria["id"],
        }
        base.update(mudancas)
        return base

    assert c1.a.cliente.post("/api/lancamentos", json=corpo()).status_code == 201
    r = c1.a.cliente.post("/api/lancamentos", json=corpo(conta_id=alheio.conjunta["id"]))
    assert r.status_code in (404, 422), r.text
    r = c1.a.cliente.post("/api/lancamentos", json=corpo(categoria_id=alheio.categoria["id"]))
    assert r.status_code == 422, r.text
    r = c1.a.cliente.post("/api/lancamentos", json=corpo(tag_ids=[alheio.tag["id"]]))
    assert r.status_code == 422, r.text


# ---------------------------------------------------------------- convites

def test_convite_do_casal_2_por_id_e_404_ao_aceitar_recusar_e_cancelar(cenario):
    c1, c2, _ = cenario
    for cli in (c1.a.cliente, c1.b.cliente):
        _nao_encontrado(cli.post(f"/api/convites/{c2.convite_id}/aceitar"))
        _nao_encontrado(cli.post(f"/api/convites/{c2.convite_id}/recusar"))
        _nao_encontrado(cli.delete(f"/api/convites/{c2.convite_id}"))


def test_convite_pendente_alheio_por_id_e_404_e_continua_pendente(fab):
    c1, c2 = fab.dois_casais()
    x, y = fab.uma_pessoa(), fab.uma_pessoa()
    r = x.cliente.post("/api/convites", json={"email": y.email})
    assert r.status_code == 201, r.text
    convite_id = r.json()["id"]
    for cli in (c1.a.cliente, c2.b.cliente):
        _nao_encontrado(cli.post(f"/api/convites/{convite_id}/aceitar"))
        _nao_encontrado(cli.post(f"/api/convites/{convite_id}/recusar"))
        _nao_encontrado(cli.delete(f"/api/convites/{convite_id}"))
    assert y.cliente.get("/api/vinculo").json()["estado"] == "convite_recebido"
