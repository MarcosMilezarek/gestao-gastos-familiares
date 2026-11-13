"""Fatia 2: tags (CA-2.11) com MySQL real: unicidade pela collation utf8mb4_0900_as_ci."""
from datetime import date

HOJE = date(2026, 3, 15)


def _tags(cliente):
    r = cliente.get("/api/tags")
    assert r.status_code == 200, r.text
    return r.json()


def _criar(cliente, nome):
    return cliente.post("/api/tags", json={"nome": nome})


def _codigo(r):
    return r.json()["erro"]["codigo"]


def _lancar_com_tags(cliente, tag_ids):
    conta = cliente.get("/api/contas").json()["contas"][0]
    cats = cliente.get("/api/categorias", params={"tipo": "despesa"}).json()
    r = cliente.post(
        "/api/lancamentos",
        json={
            "tipo": "despesa", "valor": "10.00", "data": "2026-03-10", "descricao": "t",
            "categoria_id": cats[0]["id"], "dono_usuario_id": conta["dono_usuario_id"],
            "conta_id": conta["id"], "tag_ids": tag_ids,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_cria_tag_e_aparece_na_lista_ordenada_por_nome(fab):
    p = fab.uma_pessoa()
    for nome in ("viagem", "essencial", "casa"):
        r = _criar(p.cliente, nome)
        assert r.status_code == 201, r.text
        assert r.json()["nome"] == nome and isinstance(r.json()["id"], int)
    assert [t["nome"] for t in _tags(p.cliente)] == ["casa", "essencial", "viagem"]


def test_tag_com_nome_igual_ignorando_caixa_e_recusada(fab):
    p = fab.uma_pessoa()
    assert _criar(p.cliente, "essencial").status_code == 201
    r = _criar(p.cliente, "Essencial")
    assert r.status_code == 409 and _codigo(r) == "TAG_JA_EXISTE"
    assert "nome" in r.json()["erro"]["campos"]
    assert len(_tags(p.cliente)) == 1


def test_tag_com_acento_diferente_e_nome_distinto_pela_collation_as_ci(fab):
    # A collation do projeto é utf8mb4_0900_as_ci: ignora caixa (CA-2.11), mas distingue acento.
    p = fab.uma_pessoa()
    assert _criar(p.cliente, "saúde").status_code == 201
    r = _criar(p.cliente, "SAÚDE")
    assert r.status_code == 409 and _codigo(r) == "TAG_JA_EXISTE"
    assert _criar(p.cliente, "saude").status_code == 201


def test_tag_com_espacos_nas_pontas_colide_com_a_existente(fab):
    p = fab.uma_pessoa()
    assert _criar(p.cliente, "essencial").status_code == 201
    r = _criar(p.cliente, "  essencial  ")
    assert r.status_code == 409 and _codigo(r) == "TAG_JA_EXISTE"


def test_nome_de_tag_vazio_so_espacos_ou_longo_demais_e_422(fab):
    p = fab.uma_pessoa()
    for nome in ("", "   ", "x" * 41):
        assert _criar(p.cliente, nome).status_code == 422, repr(nome)
    assert _criar(p.cliente, "x" * 40).status_code == 201


def test_mesmo_nome_de_tag_em_escopos_diferentes_e_aceito(fab):
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    assert _criar(a.cliente, "essencial").status_code == 201
    assert _criar(b.cliente, "essencial").status_code == 201


def test_tag_usada_em_lancamento_e_excluida_o_lancamento_continua(fab, relogio):
    relogio(HOJE)
    p = fab.uma_pessoa()
    tag = _criar(p.cliente, "essencial").json()
    lanc = _lancar_com_tags(p.cliente, [tag["id"]])
    assert [t["nome"] for t in lanc["tags"]] == ["essencial"]

    r = p.cliente.delete(f"/api/tags/{tag['id']}")
    assert r.status_code == 204 and r.content == b""
    assert _tags(p.cliente) == []
    r = p.cliente.get(f"/api/lancamentos/{lanc['id']}")
    assert r.status_code == 200, r.text
    assert r.json()["tags"] == []


def test_excluir_tag_preserva_as_outras_tags_do_lancamento(fab, relogio):
    relogio(HOJE)
    p = fab.uma_pessoa()
    t1 = _criar(p.cliente, "um").json()
    t2 = _criar(p.cliente, "dois").json()
    lanc = _lancar_com_tags(p.cliente, [t1["id"], t2["id"]])
    assert p.cliente.delete(f"/api/tags/{t1['id']}").status_code == 204
    r = p.cliente.get(f"/api/lancamentos/{lanc['id']}")
    assert [t["nome"] for t in r.json()["tags"]] == ["dois"]


def test_excluir_tag_depois_permite_recriar_o_mesmo_nome(fab):
    p = fab.uma_pessoa()
    tag = _criar(p.cliente, "essencial").json()
    assert p.cliente.delete(f"/api/tags/{tag['id']}").status_code == 204
    assert _criar(p.cliente, "Essencial").status_code == 201


def test_excluir_tag_inexistente_e_404(fab):
    p = fab.uma_pessoa()
    assert p.cliente.delete("/api/tags/999999").status_code == 404


def test_renomear_tag(fab):
    p = fab.uma_pessoa()
    tag = _criar(p.cliente, "essencial").json()
    r = p.cliente.patch(f"/api/tags/{tag['id']}", json={"nome": "vital"})
    assert r.status_code == 200 and r.json() == {"id": tag["id"], "nome": "vital"}


def test_renomear_so_a_caixa_ou_acento_da_propria_tag_e_aceito(fab):
    p = fab.uma_pessoa()
    tag = _criar(p.cliente, "saude").json()
    for nome in ("Saude", "saúde"):
        r = p.cliente.patch(f"/api/tags/{tag['id']}", json={"nome": nome})
        assert r.status_code == 200 and r.json()["nome"] == nome


def test_renomear_para_nome_de_outra_tag_e_409(fab):
    p = fab.uma_pessoa()
    _criar(p.cliente, "essencial")
    outra = _criar(p.cliente, "outra").json()
    r = p.cliente.patch(f"/api/tags/{outra['id']}", json={"nome": "ESSENCIAL"})
    assert r.status_code == 409 and _codigo(r) == "TAG_JA_EXISTE"


def test_lancamento_com_tag_alheia_e_recusado(fab, relogio):
    relogio(HOJE)
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    alheia = _criar(b.cliente, "dela").json()
    conta = a.cliente.get("/api/contas").json()["contas"][0]
    cat = a.cliente.get("/api/categorias", params={"tipo": "despesa"}).json()[0]["id"]
    r = a.cliente.post(
        "/api/lancamentos",
        json={
            "tipo": "despesa", "valor": "1.00", "data": "2026-03-10", "descricao": "t",
            "categoria_id": cat, "dono_usuario_id": conta["dono_usuario_id"],
            "conta_id": conta["id"], "tag_ids": [alheia["id"]],
        },
    )
    assert r.status_code == 422, r.text


# ----------------------------------------------------------- visibilidade

def test_tag_do_casal_e_visivel_as_duas_pessoas(fab):
    c = fab.um_casal()
    tid = _criar(c.a.cliente, "do casal").json()["id"]
    for cliente in (c.a.cliente, c.b.cliente):
        assert tid in {t["id"] for t in _tags(cliente)}
    assert c.b.cliente.patch(f"/api/tags/{tid}", json={"nome": "editada"}).status_code == 200
    assert c.b.cliente.delete(f"/api/tags/{tid}").status_code == 204
    assert tid not in {t["id"] for t in _tags(c.a.cliente)}


def test_nome_de_tag_do_casal_colide_entre_as_duas_pessoas(fab):
    c = fab.um_casal()
    assert _criar(c.a.cliente, "essencial").status_code == 201
    r = _criar(c.b.cliente, "Essencial")
    assert r.status_code == 409 and _codigo(r) == "TAG_JA_EXISTE"


def test_tag_do_casal_nao_vaza_para_outro_casal(fab):
    c1, c2 = fab.dois_casais()
    tid = _criar(c1.a.cliente, "do casal").json()["id"]
    assert tid not in {t["id"] for t in _tags(c2.a.cliente)}
    assert c2.a.cliente.patch(f"/api/tags/{tid}", json={"nome": "y"}).status_code == 404
    assert c2.a.cliente.delete(f"/api/tags/{tid}").status_code == 404
    assert tid in {t["id"] for t in _tags(c1.a.cliente)}


def test_tag_individual_so_o_dono_ve_e_altera(fab):
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    tid = _criar(a.cliente, "minha").json()["id"]
    assert tid in {t["id"] for t in _tags(a.cliente)}
    assert _tags(b.cliente) == []
    assert b.cliente.patch(f"/api/tags/{tid}", json={"nome": "y"}).status_code == 404
    assert b.cliente.delete(f"/api/tags/{tid}").status_code == 404


def test_sem_login_tags_exigem_sessao(fab):
    assert fab.cliente().get("/api/tags").status_code == 401
