"""Fatia 2: categorias e subcategorias (CA-2.07 a CA-2.10) e casos de docs/revisoes/t98.md."""
from datetime import date

HOJE = date(2026, 3, 15)

PADRAO_DESPESA = {
    "Moradia/Casa": [],
    "Gastos fixos": ["Contas", "Saúde", "Transporte"],
    "Gastos variáveis": [
        "Alimentação fora", "Assinaturas", "Compras", "Educação", "Lazer", "Mercado",
    ],
    "Investimento": [],
    "Outros": [],
}


def _listar(cliente, **params):
    r = cliente.get("/api/categorias", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def _raiz(cliente, nome, tipo="despesa", **params):
    for c in _listar(cliente, tipo=tipo, **params):
        if c["nome"] == nome:
            return c
    raise AssertionError(f"raiz {nome!r} não encontrada")


def _sub(cliente, pai, nome, tipo="despesa"):
    return next(s for s in _raiz(cliente, pai, tipo)["subcategorias"] if s["nome"] == nome)


def _criar(cliente, nome, *, tipo="despesa", pai=None, cor="#112233", icone="house"):
    corpo = {"tipo": tipo, "nome": nome, "icone": icone, "cor": cor}
    if pai is not None:
        corpo["categoria_pai_id"] = pai
    return cliente.post("/api/categorias", json=corpo)


def _codigo(r):
    return r.json()["erro"]["codigo"]


def _lancar(cliente, categoria_id, *, tipo="despesa"):
    conta = next(
        c for c in cliente.get("/api/contas").json()["contas"] if c["dono_usuario_id"]
    )
    r = cliente.post(
        "/api/lancamentos",
        json={
            "tipo": tipo,
            "valor": "10.00",
            "data": "2026-03-10",
            "descricao": "teste",
            "categoria_id": categoria_id,
            "dono_usuario_id": conta["dono_usuario_id"],
            "conta_id": conta["id"],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _categoria_do_lancamento(cliente, lanc_id):
    r = cliente.get(f"/api/lancamentos/{lanc_id}")
    assert r.status_code == 200, r.text
    return r.json()["categoria"]["id"]


# ------------------------------------------------------------------ CA-2.07

def test_cria_categoria_com_nome_icone_e_cor(fab):
    p = fab.uma_pessoa()
    r = _criar(p.cliente, "Pets", icone="paw-print", cor="#AA00BB")
    assert r.status_code == 201, r.text
    c = r.json()
    assert (c["nome"], c["icone"], c["cor"], c["tipo"]) == ("Pets", "paw-print", "#AA00BB", "despesa")
    assert c["categoria_pai_id"] is None and c["fixa"] is False and c["subcategorias"] == []
    assert _raiz(p.cliente, "Pets")["cor"] == "#AA00BB"


def test_subcategoria_exibe_a_cor_da_categoria(fab):
    p = fab.uma_pessoa()
    pai = _criar(p.cliente, "Pets", cor="#AA00BB").json()
    r = _criar(p.cliente, "Ração", pai=pai["id"], cor="#000000")  # cor enviada é ignorada
    assert r.status_code == 201, r.text
    assert r.json()["cor"] == "#AA00BB"
    assert r.json()["categoria_pai_id"] == pai["id"]
    assert _sub(p.cliente, "Pets", "Ração")["cor"] == "#AA00BB"


def test_subcategoria_dentro_de_subcategoria_e_recusada(fab):
    p = fab.uma_pessoa()
    pai = _criar(p.cliente, "Pets").json()
    sub = _criar(p.cliente, "Ração", pai=pai["id"]).json()
    r = _criar(p.cliente, "Premium", pai=sub["id"])
    assert r.status_code == 409 and _codigo(r) == "CATEGORIA_NIVEL_INVALIDO"


def test_raiz_sem_cor_e_422(fab):
    p = fab.uma_pessoa()
    r = p.cliente.post("/api/categorias", json={"tipo": "despesa", "nome": "X", "icone": "house"})
    assert r.status_code == 422 and "cor" in r.json()["erro"]["campos"]


def test_nome_vazio_ou_so_espacos_e_422(fab):
    p = fab.uma_pessoa()
    assert _criar(p.cliente, "   ").status_code == 422


def test_subcategoria_de_pai_arquivado_e_recusada(fab):
    p = fab.uma_pessoa()
    pai = _criar(p.cliente, "Pets").json()
    assert p.cliente.post(f"/api/categorias/{pai['id']}/arquivar", json={}).status_code == 200
    r = _criar(p.cliente, "Ração", pai=pai["id"])
    assert r.status_code == 409 and _codigo(r) == "CATEGORIA_ARQUIVADA"


def test_nome_repetido_na_mesma_raiz_ignora_caixa(fab):
    p = fab.uma_pessoa()
    r = _criar(p.cliente, "moradia/casa")
    assert r.status_code == 409 and _codigo(r) == "CATEGORIA_JA_EXISTE"
    assert "nome" in r.json()["erro"]["campos"]
    r = _criar(p.cliente, "outros")
    assert r.status_code == 409 and _codigo(r) == "CATEGORIA_JA_EXISTE"


def test_mesmo_nome_em_pais_diferentes_e_aceito_e_no_mesmo_pai_nao(fab):
    p = fab.uma_pessoa()
    a = _criar(p.cliente, "A").json()
    b = _criar(p.cliente, "B").json()
    assert _criar(p.cliente, "Filha", pai=a["id"]).status_code == 201
    assert _criar(p.cliente, "Filha", pai=b["id"]).status_code == 201
    r = _criar(p.cliente, "filha", pai=a["id"])
    assert r.status_code == 409 and _codigo(r) == "CATEGORIA_JA_EXISTE"


def test_mesmo_nome_em_tipos_diferentes_e_aceito(fab):
    p = fab.uma_pessoa()
    assert _criar(p.cliente, "Extra", tipo="despesa").status_code == 201
    assert _criar(p.cliente, "Extra", tipo="receita").status_code == 201


# ---- t98: subcategoria de tipo divergente e só sob a mesma categoria-pai

def test_subcategoria_de_tipo_diferente_do_pai_e_409(fab):
    p = fab.uma_pessoa()
    pai = _raiz(p.cliente, "Gastos fixos")
    r = _criar(p.cliente, "Bônus", tipo="receita", pai=pai["id"])
    assert r.status_code == 409 and _codigo(r) == "CATEGORIA_TIPO_INVALIDO"


def test_subcategoria_so_existe_sob_o_pai_informado(fab):
    p = fab.uma_pessoa()
    pai = _criar(p.cliente, "Pets").json()
    sub = _criar(p.cliente, "Ração", pai=pai["id"]).json()
    assert sub["categoria_pai_id"] == pai["id"]
    assert [s["nome"] for s in _raiz(p.cliente, "Pets")["subcategorias"]] == ["Ração"]
    assert _raiz(p.cliente, "Outros")["subcategorias"] == []
    nomes_raiz = {c["nome"] for c in _listar(p.cliente, tipo="despesa")}
    assert "Ração" not in nomes_raiz  # subcategoria não aparece como raiz


def test_pai_inexistente_ou_de_outro_casal_e_422_generico(fab):
    c1, c2 = fab.dois_casais()
    alheia = _raiz(c2.a.cliente, "Outros")["id"]
    r = _criar(c1.a.cliente, "X", pai=alheia)
    assert r.status_code == 422 and "categoria_pai_id" in r.json()["erro"]["campos"]
    assert _criar(c1.a.cliente, "X", pai=999999).status_code == 422


# ------------------------------------------------------------------ CA-2.08

def test_lista_padrao_logo_apos_o_cadastro(fab):
    p = fab.uma_pessoa()
    despesas = {c["nome"]: [s["nome"] for s in c["subcategorias"]] for c in _listar(p.cliente, tipo="despesa")}
    assert set(despesas) == set(PADRAO_DESPESA)
    for nome, subs in PADRAO_DESPESA.items():
        assert sorted(despesas[nome]) == sorted(subs), nome
    receitas = _listar(p.cliente, tipo="receita")
    assert [c["nome"] for c in receitas] == ["Salário"]


def test_categorias_padrao_trazem_icone_cor_e_nenhuma_arquivada(fab):
    p = fab.uma_pessoa()
    for c in _listar(p.cliente):
        assert c["icone"] and c["cor"].startswith("#") and c["arquivado"] is False
        for s in c["subcategorias"]:
            assert s["cor"] == c["cor"] and s["fixa"] is False


def test_nome_de_categoria_padrao_pode_ser_alterado_exceto_salario(fab):
    p = fab.uma_pessoa()
    moradia = _raiz(p.cliente, "Moradia/Casa")
    r = p.cliente.patch(f"/api/categorias/{moradia['id']}", json={"nome": "Casa"})
    assert r.status_code == 200 and r.json()["nome"] == "Casa"
    sub = _sub(p.cliente, "Gastos fixos", "Contas")
    r = p.cliente.patch(f"/api/categorias/{sub['id']}", json={"nome": "Boletos"})
    assert r.status_code == 200 and r.json()["nome"] == "Boletos"


def test_icone_e_cor_da_categoria_padrao_sao_editaveis(fab):
    p = fab.uma_pessoa()
    c = _raiz(p.cliente, "Outros")
    r = p.cliente.patch(f"/api/categorias/{c['id']}", json={"icone": "star", "cor": "#010203"})
    assert r.status_code == 200
    assert (r.json()["icone"], r.json()["cor"]) == ("star", "#010203")


def test_cor_enviada_para_subcategoria_no_patch_e_ignorada(fab):
    p = fab.uma_pessoa()
    sub = _sub(p.cliente, "Gastos fixos", "Contas")
    pai_cor = _raiz(p.cliente, "Gastos fixos")["cor"]
    r = p.cliente.patch(f"/api/categorias/{sub['id']}", json={"cor": "#FFFFFF"})
    assert r.status_code == 200 and r.json()["cor"] == pai_cor


def test_cada_pessoa_tem_sua_propria_lista_padrao(fab):
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    ids_a = {c["id"] for c in _listar(a.cliente)}
    ids_b = {c["id"] for c in _listar(b.cliente)}
    assert ids_a and ids_b and not (ids_a & ids_b)


# ------------------------------------------------------------------ CA-2.09

def test_salario_existe_como_receita_fixa_com_quatro_subcategorias(fab):
    p = fab.uma_pessoa()
    salario = _raiz(p.cliente, "Salário", "receita")
    assert salario["fixa"] is True and salario["tipo"] == "receita"
    assert sorted(s["nome"] for s in salario["subcategorias"]) == sorted(
        ["Salário", "13º", "Férias", "Horas extras"]
    )


def test_renomear_salario_e_recusado(fab):
    p = fab.uma_pessoa()
    sal = _raiz(p.cliente, "Salário", "receita")
    r = p.cliente.patch(f"/api/categorias/{sal['id']}", json={"nome": "Renda"})
    assert r.status_code == 409 and _codigo(r) == "CATEGORIA_FIXA"
    assert _raiz(p.cliente, "Salário", "receita")["id"] == sal["id"]


def test_arquivar_salario_e_recusado_mesmo_sem_uso(fab):
    p = fab.uma_pessoa()
    sal = _raiz(p.cliente, "Salário", "receita")
    r = p.cliente.post(f"/api/categorias/{sal['id']}/arquivar", json={})
    assert r.status_code == 409 and _codigo(r) == "CATEGORIA_FIXA"
    assert _raiz(p.cliente, "Salário", "receita")["arquivado"] is False


def test_nao_existe_rota_para_excluir_categoria(fab):
    p = fab.uma_pessoa()
    sal = _raiz(p.cliente, "Salário", "receita")
    r = p.cliente.delete(f"/api/categorias/{sal['id']}")
    assert r.status_code == 405
    assert _raiz(p.cliente, "Salário", "receita")


def test_icone_e_cor_de_salario_podem_mudar(fab):
    p = fab.uma_pessoa()
    sal = _raiz(p.cliente, "Salário", "receita")
    r = p.cliente.patch(f"/api/categorias/{sal['id']}", json={"icone": "star", "cor": "#010203"})
    assert r.status_code == 200 and r.json()["cor"] == "#010203"


def test_renomear_salario_para_o_mesmo_nome_nao_e_alteracao(fab):
    p = fab.uma_pessoa()
    sal = _raiz(p.cliente, "Salário", "receita")
    r = p.cliente.patch(f"/api/categorias/{sal['id']}", json={"nome": "Salário"})
    assert r.status_code == 200


def test_adicionar_subcategoria_bonus_a_salario_e_aceito(fab):
    p = fab.uma_pessoa()
    sal = _raiz(p.cliente, "Salário", "receita")
    r = _criar(p.cliente, "Bônus", tipo="receita", pai=sal["id"])
    assert r.status_code == 201, r.text
    assert r.json()["cor"] == sal["cor"]
    nomes = [s["nome"] for s in _raiz(p.cliente, "Salário", "receita")["subcategorias"]]
    assert "Bônus" in nomes and len(nomes) == 5


# ------------------------------------------------------------------ CA-2.10

def _tres_lancamentos(cliente, categoria_id):
    return [_lancar(cliente, categoria_id) for _ in range(3)]


def test_arquivar_categoria_em_uso_sem_destino_exige_destino(fab, relogio):
    relogio(HOJE)
    p = fab.uma_pessoa()
    origem = _criar(p.cliente, "Origem").json()
    _tres_lancamentos(p.cliente, origem["id"])
    r = p.cliente.post(f"/api/categorias/{origem['id']}/arquivar", json={})
    assert r.status_code == 409 and _codigo(r) == "CATEGORIA_EM_USO"
    assert "mover_para_id" in r.json()["erro"]["campos"]
    assert _raiz(p.cliente, "Origem")["arquivado"] is False


def test_arquivar_com_destino_reatribui_os_tres_lancamentos(fab, relogio):
    relogio(HOJE)
    p = fab.uma_pessoa()
    origem = _criar(p.cliente, "Origem").json()
    destino = _criar(p.cliente, "Destino").json()
    lancs = _tres_lancamentos(p.cliente, origem["id"])
    r = p.cliente.post(
        f"/api/categorias/{origem['id']}/arquivar", json={"mover_para_id": destino["id"]}
    )
    assert r.status_code == 200, r.text
    assert r.json()["arquivado"] is True
    for lid in lancs:
        assert _categoria_do_lancamento(p.cliente, lid) == destino["id"]


def test_categoria_arquivada_some_do_seletor_e_aparece_com_incluir_arquivadas(fab):
    p = fab.uma_pessoa()
    c = _criar(p.cliente, "Origem").json()
    sub = _criar(p.cliente, "Filha", pai=c["id"]).json()
    assert p.cliente.post(f"/api/categorias/{c['id']}/arquivar", json={}).status_code == 200
    assert "Origem" not in {x["nome"] for x in _listar(p.cliente)}
    todas = {x["nome"]: x for x in _listar(p.cliente, incluir_arquivadas="true")}
    assert todas["Origem"]["arquivado"] is True
    assert [s["arquivado"] for s in todas["Origem"]["subcategorias"]] == [True]
    assert sub["id"] == todas["Origem"]["subcategorias"][0]["id"]


def test_novo_lancamento_em_categoria_arquivada_e_recusado(fab, relogio):
    relogio(HOJE)
    p = fab.uma_pessoa()
    c = _criar(p.cliente, "Origem").json()
    p.cliente.post(f"/api/categorias/{c['id']}/arquivar", json={})
    conta = p.cliente.get("/api/contas").json()["contas"][0]
    r = p.cliente.post(
        "/api/lancamentos",
        json={
            "tipo": "despesa", "valor": "1.00", "data": "2026-03-10", "descricao": "x",
            "categoria_id": c["id"], "dono_usuario_id": conta["dono_usuario_id"],
            "conta_id": conta["id"],
        },
    )
    assert r.status_code in (409, 422), r.text


def test_arquivar_raiz_leva_lancamentos_das_subcategorias_ao_destino(fab, relogio):
    relogio(HOJE)
    p = fab.uma_pessoa()
    pai = _criar(p.cliente, "Pets").json()
    sub = _criar(p.cliente, "Ração", pai=pai["id"]).json()
    destino = _raiz(p.cliente, "Outros")
    l_pai, l_sub = _lancar(p.cliente, pai["id"]), _lancar(p.cliente, sub["id"])
    r = p.cliente.post(
        f"/api/categorias/{pai['id']}/arquivar", json={"mover_para_id": destino["id"]}
    )
    assert r.status_code == 200, r.text
    assert _categoria_do_lancamento(p.cliente, l_pai) == destino["id"]
    assert _categoria_do_lancamento(p.cliente, l_sub) == destino["id"]


def test_arquivar_sem_uso_dispensa_destino_e_corpo_pode_faltar(fab):
    # t98 S4: `mover_para_id` é opcional (§3.2); o corpo inteiro também deve poder faltar.
    p = fab.uma_pessoa()
    c = _criar(p.cliente, "Vazia").json()
    r = p.cliente.post(f"/api/categorias/{c['id']}/arquivar")
    assert r.status_code == 200, r.text
    assert r.json()["arquivado"] is True


def test_arquivar_com_corpo_vazio_sem_uso_e_aceito(fab):
    p = fab.uma_pessoa()
    c = _criar(p.cliente, "Vazia").json()
    assert p.cliente.post(f"/api/categorias/{c['id']}/arquivar", json={}).status_code == 200


def test_destino_invalido_no_arquivar(fab, relogio):
    relogio(HOJE)
    p = fab.uma_pessoa()
    origem = _criar(p.cliente, "Origem").json()
    filha = _criar(p.cliente, "Filha", pai=origem["id"]).json()
    receita = _raiz(p.cliente, "Salário", "receita")
    arquivada = _criar(p.cliente, "Velha").json()
    p.cliente.post(f"/api/categorias/{arquivada['id']}/arquivar", json={})
    _lancar(p.cliente, origem["id"])
    url = f"/api/categorias/{origem['id']}/arquivar"
    for destino in (origem["id"], filha["id"], receita["id"], arquivada["id"]):
        r = p.cliente.post(url, json={"mover_para_id": destino})
        assert r.status_code == 409 and _codigo(r) == "CATEGORIA_DESTINO_INVALIDO", destino
    assert _raiz(p.cliente, "Origem")["arquivado"] is False


def test_destino_inexistente_ou_de_outro_casal_e_422(fab, relogio):
    relogio(HOJE)
    c1, c2 = fab.dois_casais()
    origem = _criar(c1.a.cliente, "Origem").json()
    _lancar(c1.a.cliente, origem["id"])
    alheia = _raiz(c2.a.cliente, "Outros")["id"]
    for destino in (alheia, 999999):
        r = c1.a.cliente.post(
            f"/api/categorias/{origem['id']}/arquivar", json={"mover_para_id": destino}
        )
        assert r.status_code == 422, r.text


def test_mover_lancamentos_leva_todos_de_a_para_b(fab, relogio):
    relogio(HOJE)
    p = fab.uma_pessoa()
    a = _criar(p.cliente, "A").json()
    b = _criar(p.cliente, "B").json()
    lancs = _tres_lancamentos(p.cliente, a["id"])
    r = p.cliente.post(f"/api/categorias/{a['id']}/mover-lancamentos", json={"destino_id": b["id"]})
    assert r.status_code == 200 and r.json() == {"movidos": 3}
    for lid in lancs:
        assert _categoria_do_lancamento(p.cliente, lid) == b["id"]
    assert _raiz(p.cliente, "A")["arquivado"] is False  # mover não arquiva


def test_mover_lancamentos_sem_nenhum_devolve_zero(fab):
    p = fab.uma_pessoa()
    a = _criar(p.cliente, "A").json()
    b = _criar(p.cliente, "B").json()
    r = p.cliente.post(f"/api/categorias/{a['id']}/mover-lancamentos", json={"destino_id": b["id"]})
    assert r.status_code == 200 and r.json() == {"movidos": 0}


def test_mover_lancamentos_para_si_mesma_ou_tipo_diferente_e_409(fab):
    p = fab.uma_pessoa()
    a = _criar(p.cliente, "A").json()
    receita = _raiz(p.cliente, "Salário", "receita")
    for destino in (a["id"], receita["id"]):
        r = p.cliente.post(
            f"/api/categorias/{a['id']}/mover-lancamentos", json={"destino_id": destino}
        )
        assert r.status_code == 409 and _codigo(r) == "CATEGORIA_DESTINO_INVALIDO"


def test_lancamento_antigo_continua_mostrando_categoria_arquivada(fab, relogio):
    relogio(HOJE)
    p = fab.uma_pessoa()
    c = _criar(p.cliente, "Origem").json()
    lanc = _lancar(p.cliente, c["id"])
    # mover para si não é permitido; arquiva movendo para outra e confere o contrário:
    outra = _criar(p.cliente, "Outra").json()
    lanc2 = _lancar(p.cliente, outra["id"])
    p.cliente.post(f"/api/categorias/{outra['id']}/arquivar", json={"mover_para_id": c["id"]})
    assert _categoria_do_lancamento(p.cliente, lanc2) == c["id"]
    assert _categoria_do_lancamento(p.cliente, lanc) == c["id"]


# ------------------------------------------------- t98 I3: renomear com colisão

def test_renomear_so_a_caixa_da_propria_categoria_e_aceito(fab):
    p = fab.uma_pessoa()
    c = _criar(p.cliente, "mercado2").json()
    r = p.cliente.patch(f"/api/categorias/{c['id']}", json={"nome": "Mercado2"})
    assert r.status_code == 200, r.text
    assert r.json()["nome"] == "Mercado2"


def test_renomear_so_o_acento_da_propria_categoria_e_aceito_pois_acento_distingue(fab):
    p = fab.uma_pessoa()
    c = _criar(p.cliente, "Saude extra").json()
    r = p.cliente.patch(f"/api/categorias/{c['id']}", json={"nome": "Saúde extra"})
    assert r.status_code == 200, r.text
    assert r.json()["nome"] == "Saúde extra"


def test_renomear_para_nome_de_outra_categoria_e_409(fab):
    p = fab.uma_pessoa()
    c = _criar(p.cliente, "Nova").json()
    for nome in ("Outros", "outros", "OUTROS"):
        r = p.cliente.patch(f"/api/categorias/{c['id']}", json={"nome": nome})
        assert r.status_code == 409 and _codigo(r) == "CATEGORIA_JA_EXISTE", nome
        assert "nome" in r.json()["erro"]["campos"]
    assert _raiz(p.cliente, "Nova")["nome"] == "Nova"


def test_renomear_subcategoria_colide_so_com_irma(fab):
    p = fab.uma_pessoa()
    sub = _sub(p.cliente, "Gastos fixos", "Contas")
    r = p.cliente.patch(f"/api/categorias/{sub['id']}", json={"nome": "transporte"})
    assert r.status_code == 409 and _codigo(r) == "CATEGORIA_JA_EXISTE"
    # "Mercado" existe em outro pai: não colide
    r = p.cliente.patch(f"/api/categorias/{sub['id']}", json={"nome": "Mercado"})
    assert r.status_code == 200, r.text


def test_renomear_categoria_arquivada_e_409(fab):
    p = fab.uma_pessoa()
    c = _criar(p.cliente, "Velha").json()
    p.cliente.post(f"/api/categorias/{c['id']}/arquivar", json={})
    r = p.cliente.patch(f"/api/categorias/{c['id']}", json={"nome": "Outra"})
    assert r.status_code == 409 and _codigo(r) == "CATEGORIA_ARQUIVADA"


# ------------------------------------------- t98: instituicao só com espaços

def test_instituicao_so_com_espacos_nao_grava_texto_em_branco(fab):
    p = fab.uma_pessoa()
    conta = p.cliente.get("/api/contas").json()["contas"][0]
    r = p.cliente.patch(f"/api/contas/{conta['id']}", json={"instituicao": "    "})
    assert r.status_code == 200, r.text
    assert r.json()["instituicao"] in (None, "")
    assert (p.cliente.get(f"/api/contas/{conta['id']}").json()["instituicao"] or "") == ""


# ----------------------------------------------------------- visibilidade

def test_categoria_do_casal_e_visivel_as_duas_pessoas(fab):
    c = fab.um_casal()
    r = _criar(c.a.cliente, "Do casal")
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    for cliente in (c.a.cliente, c.b.cliente):
        assert cid in {x["id"] for x in _listar(cliente)}
    # B pode editá-la
    assert c.b.cliente.patch(f"/api/categorias/{cid}", json={"nome": "Editada"}).status_code == 200


def test_categoria_do_casal_nao_vaza_para_outro_casal(fab):
    c1, c2 = fab.dois_casais()
    cid = _criar(c1.a.cliente, "Do casal").json()["id"]
    assert cid not in {x["id"] for x in _listar(c2.a.cliente)}
    assert c2.a.cliente.patch(f"/api/categorias/{cid}", json={"nome": "Y"}).status_code == 404
    assert c2.a.cliente.post(f"/api/categorias/{cid}/arquivar", json={}).status_code == 404


def test_categoria_individual_so_o_dono_ve_e_altera(fab):
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    cid = _criar(a.cliente, "Minha").json()["id"]
    assert cid in {x["id"] for x in _listar(a.cliente)}
    assert cid not in {x["id"] for x in _listar(b.cliente)}
    assert b.cliente.patch(f"/api/categorias/{cid}", json={"nome": "Y"}).status_code == 404
    assert b.cliente.post(
        f"/api/categorias/{cid}/mover-lancamentos", json={"destino_id": cid}
    ).status_code == 404


def test_sem_login_categorias_exigem_sessao(fab):
    assert fab.cliente().get("/api/categorias").status_code == 401
