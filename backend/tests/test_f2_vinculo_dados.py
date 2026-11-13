"""Fatia 2: união de listas no vínculo e cópia no desvínculo (CA-2.23, CA-1.10) com MySQL real.

Cobre o roteiro de docs/revisoes/t96r.md: unicidade nos UPDATE em bloco, collation no JOIN,
UPDATE IGNORE, erro 1093 (subconsulta no UPDATE), ordem dos DELETE, rollback e casal sem conjunta.
"""
from datetime import date

import pytest
from sqlalchemy import text
from sqlalchemy.exc import NoResultFound

from app.acesso import contexto_do_usuario
from app.errors import AppError
from app.services import vinculo, vinculo_dados

HOJE = date(2026, 3, 15)
VERMELHO, AZUL = "#FF0000", "#0000FF"


# ---------------------------------------------------------------- helpers

def _json(r, status=200):
    assert r.status_code == status, r.text
    return r.json()


def _cats(cli, tipo="despesa"):
    return _json(cli.get("/api/categorias", params={"tipo": tipo, "incluir_arquivadas": True}))


def _raiz(cli, nome, tipo="despesa"):
    achadas = [c for c in _cats(cli, tipo) if c["nome"] == nome]
    assert len(achadas) == 1, f"raiz {nome!r}: {len(achadas)} encontradas"
    return achadas[0]


def _sub(cli, pai, nome, tipo="despesa"):
    achadas = [s for s in _raiz(cli, pai, tipo)["subcategorias"] if s["nome"] == nome]
    assert len(achadas) == 1, f"sub {pai!r}/{nome!r}: {len(achadas)} encontradas"
    return achadas[0]


def _criar_cat(cli, nome, *, tipo="despesa", pai=None, cor=VERMELHO, icone="house"):
    corpo = {"tipo": tipo, "nome": nome, "icone": icone}
    if pai is None:
        corpo["cor"] = cor
    else:
        corpo["categoria_pai_id"] = pai
    return _json(cli.post("/api/categorias", json=corpo), 201)


def _arquivar_cat(cli, cat_id):
    return _json(cli.post(f"/api/categorias/{cat_id}/arquivar", json={}))


def _renomear_cat(cli, cat_id, nome):
    return _json(cli.patch(f"/api/categorias/{cat_id}", json={"nome": nome}))


def _criar_tag(cli, nome):
    return _json(cli.post("/api/tags", json={"nome": nome}), 201)


def _tags(cli):
    return _json(cli.get("/api/tags"))


def _tag(cli, nome):
    achadas = [t for t in _tags(cli) if t["nome"] == nome]
    assert len(achadas) == 1, f"tag {nome!r}: {len(achadas)} encontradas"
    return achadas[0]


def _conta(cli, conjunta=False, dono=None):
    contas = _json(cli.get("/api/contas"))["contas"]
    if conjunta:
        return next(c for c in contas if c["dono_usuario_id"] is None)
    return next(c for c in contas if c["dono_usuario_id"] == dono)


def _lancar(cli, pessoa_id, cat_id, *, conjunta=False, tags=(), situacao=None, dia="2026-03-10"):
    conta = _conta(cli, conjunta, pessoa_id)
    corpo = {
        "tipo": "despesa", "valor": "10.00", "data": dia, "descricao": "lanc",
        "categoria_id": cat_id, "dono_usuario_id": None if conjunta else pessoa_id,
        "conta_id": conta["id"], "tag_ids": list(tags),
    }
    if situacao:
        corpo["situacao"] = situacao
    return _json(cli.post("/api/lancamentos", json=corpo), 201)


def _lanc(cli, lanc_id):
    return _json(cli.get(f"/api/lancamentos/{lanc_id}"))


def _vincular(a, b):
    convite = _json(a.cliente.post("/api/convites", json={"email": b.email}), 201)["id"]
    r = _json(b.cliente.post(f"/api/convites/{convite}/aceitar"))
    assert r["estado"] == "vinculado"
    return convite


def _desvincular(pessoa):
    return _json(pessoa.cliente.post("/api/vinculo/desvincular", json={"confirmar": True}))


def _foto(cli):
    """Listas visíveis (categorias das duas direções e tags) sem ids, para comparar listas."""
    cats = set()
    for tipo in ("despesa", "receita"):
        for c in _cats(cli, tipo):
            cats.add((tipo, c["nome"], c["icone"], c["cor"], c["fixa"], c["arquivado"], None))
            for s in c["subcategorias"]:
                cats.add((tipo, s["nome"], s["icone"], s["cor"], s["fixa"], s["arquivado"], c["nome"]))
    return cats, {t["nome"] for t in _tags(cli)}


def _ids(cli):
    ids = set()
    for tipo in ("despesa", "receita"):
        for c in _cats(cli, tipo):
            ids.add(c["id"])
            ids.update(s["id"] for s in c["subcategorias"])
    return ids, {t["id"] for t in _tags(cli)}


def _preparar_a_e_b(fab):
    """A e B ainda sem vínculo, com as listas do cenário de CA-2.23. Devolve (a, b, dados)."""
    a, b = fab.uma_pessoa("Ana"), fab.uma_pessoa("Beto")
    ca, cb = a.cliente, b.cliente
    d = {}
    # A: Pets (vermelha, ícone paw), Viagem (com subs, depois arquivada), Moradia/Casa > Outros, tag casa.
    d["pets_a"] = _criar_cat(ca, "Pets", cor=VERMELHO, icone="paw")
    viagem_a = _criar_cat(ca, "Viagem", cor=VERMELHO)
    _criar_cat(ca, "Hotel", pai=viagem_a["id"])
    _criar_cat(ca, "Taxi", pai=viagem_a["id"])
    _arquivar_cat(ca, viagem_a["id"])
    _criar_cat(ca, "Outros", pai=_raiz(ca, "Moradia/Casa")["id"])
    d["tag_a"] = _criar_tag(ca, "casa")
    d["lanc_a"] = _lancar(ca, a.id, d["pets_a"]["id"], tags=[d["tag_a"]["id"]])
    # B: "mercado" minúsculo, pets azul, Viagem ativa, Outros sob Gastos fixos, tags Casa e obra.
    _renomear_cat(cb, _sub(cb, "Gastos variáveis", "Mercado")["id"], "mercado")
    d["pets_b"] = _criar_cat(cb, "pets", cor=AZUL, icone="fish")
    viagem_b = _criar_cat(cb, "Viagem", cor=AZUL)
    d["hotel_b"] = _criar_cat(cb, "hotel", pai=viagem_b["id"])
    _criar_cat(cb, "Voo", pai=viagem_b["id"])
    _criar_cat(cb, "Outros", pai=_raiz(cb, "Gastos fixos")["id"])
    d["tag_b_casa"] = _criar_tag(cb, "Casa")
    d["tag_b_obra"] = _criar_tag(cb, "obra")
    d["lanc_b_pets"] = _lancar(cb, b.id, d["pets_b"]["id"], tags=[d["tag_b_casa"]["id"]])
    d["lanc_b_hotel"] = _lancar(cb, b.id, d["hotel_b"]["id"])
    d["lanc_b_mercado"] = _lancar(cb, b.id, _sub(cb, "Gastos variáveis", "mercado")["id"])
    return a, b, d


@pytest.fixture
def cenario(fab, relogio):
    relogio(HOJE)
    return fab, *_preparar_a_e_b(fab)


@pytest.fixture
def uniao(cenario):
    """O cenário já vinculado (A convidou B)."""
    fab, a, b, d = cenario
    _vincular(a, b)
    return fab, a, b, d


# ---------------------------------------------------------------- união de categorias (CA-2.23)

def test_uniao_deixa_uma_unica_mercado_alem_de_pets_e_viagem(uniao):
    _, a, b, _ = uniao
    for cli in (a.cliente, b.cliente):
        sub_mercado = [
            s["nome"] for s in _raiz(cli, "Gastos variáveis")["subcategorias"]
            if s["nome"].lower() == "mercado"
        ]
        assert sub_mercado == ["Mercado"]
        raizes = [c["nome"] for c in _cats(cli)]
        assert "Pets" in raizes and "Viagem" in raizes and "pets" not in raizes
        assert raizes.count("Pets") == 1 and raizes.count("Viagem") == 1


def test_uniao_as_duas_pessoas_veem_exatamente_a_mesma_lista(uniao):
    _, a, b, _ = uniao
    assert _foto(a.cliente) == _foto(b.cliente)
    assert _ids(a.cliente) == _ids(b.cliente)


def test_lancamento_antigo_de_a_continua_em_pets_com_a_tag_casa(uniao):
    _, a, _, d = uniao
    lanc = _lanc(a.cliente, d["lanc_a"]["id"])
    assert lanc["categoria"]["id"] == d["pets_a"]["id"]
    assert lanc["categoria"]["nome"] == "Pets"
    assert [t["nome"] for t in lanc["tags"]] == ["casa"]
    assert lanc["tags"][0]["id"] == d["tag_a"]["id"]


def test_pets_com_cor_diferente_fica_com_grafia_cor_e_icone_de_a(uniao):
    _, a, b, _ = uniao
    for cli in (a.cliente, b.cliente):
        pets = _raiz(cli, "Pets")
        assert pets["cor"] == VERMELHO and pets["icone"] == "paw"


def test_lancamento_de_b_em_pets_minusculo_passa_para_pets_de_a_e_a_tag_para_a_de_a(uniao):
    _, _, b, d = uniao
    lanc = _lanc(b.cliente, d["lanc_b_pets"]["id"])
    assert lanc["categoria"]["id"] == d["pets_a"]["id"]
    assert lanc["categoria"]["nome"] == "Pets"
    assert [(t["id"], t["nome"]) for t in lanc["tags"]] == [(d["tag_a"]["id"], "casa")]


def test_subcategoria_mercado_de_b_funde_na_de_a_e_o_lancamento_acompanha(uniao):
    _, a, b, d = uniao
    lanc = _lanc(b.cliente, d["lanc_b_mercado"]["id"])
    assert lanc["categoria"]["id"] == _sub(a.cliente, "Gastos variáveis", "Mercado")["id"]
    assert lanc["categoria"]["nome"] == "Mercado"


def test_viagem_arquivada_em_a_e_ativa_em_b_fica_ativa_no_casal(uniao):
    _, a, b, _ = uniao
    for cli in (a.cliente, b.cliente):
        assert _raiz(cli, "Viagem")["arquivado"] is False


def test_viagem_ativa_em_a_e_arquivada_em_b_tambem_fica_ativa(fab, relogio):
    relogio(HOJE)
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    _criar_cat(a.cliente, "Viagem")
    _arquivar_cat(b.cliente, _criar_cat(b.cliente, "Viagem")["id"])
    _vincular(a, b)
    assert _raiz(a.cliente, "Viagem")["arquivado"] is False


def test_viagem_arquivada_nas_duas_continua_arquivada(fab, relogio):
    relogio(HOJE)
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    for p in (a, b):
        _arquivar_cat(p.cliente, _criar_cat(p.cliente, "Viagem")["id"])
    _vincular(a, b)
    assert _raiz(a.cliente, "Viagem")["arquivado"] is True


def test_subcategorias_de_viagem_funde_a_de_mesmo_nome_e_soma_as_demais(uniao):
    _, a, b, d = uniao
    subs = {s["nome"]: s for s in _raiz(a.cliente, "Viagem")["subcategorias"]}
    assert set(subs) == {"Hotel", "Taxi", "Voo"}
    assert subs["Hotel"]["arquivado"] is False  # arquivada em A (cascata), ativa em B
    assert subs["Taxi"]["arquivado"] is True
    assert subs["Voo"]["arquivado"] is False
    lanc = _lanc(b.cliente, d["lanc_b_hotel"]["id"])
    assert lanc["categoria"]["id"] == subs["Hotel"]["id"]
    assert lanc["categoria"]["nome"] == "Hotel"


def test_outros_sob_moradia_e_outros_sob_gastos_fixos_ficam_distintas(uniao):
    _, a, _, _ = uniao
    moradia = [s["nome"] for s in _raiz(a.cliente, "Moradia/Casa")["subcategorias"]]
    fixos = [s["nome"] for s in _raiz(a.cliente, "Gastos fixos")["subcategorias"]]
    assert moradia == ["Outros"]
    assert fixos.count("Outros") == 1
    ids = {_sub(a.cliente, "Moradia/Casa", "Outros")["id"], _sub(a.cliente, "Gastos fixos", "Outros")["id"]}
    assert len(ids) == 2


def test_raiz_de_b_sem_par_leva_todas_as_subcategorias_de_uma_vez(fab, relogio):
    relogio(HOJE)
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    hobby = _criar_cat(b.cliente, "Hobby")
    for nome in ("Livros", "Jogos", "Outros"):
        _criar_cat(b.cliente, nome, pai=hobby["id"])
    _vincular(a, b)
    for cli in (a.cliente, b.cliente):
        raiz = _raiz(cli, "Hobby")
        assert raiz["id"] == hobby["id"]
        assert sorted(s["nome"] for s in raiz["subcategorias"]) == ["Jogos", "Livros", "Outros"]
        assert {s["categoria_pai_id"] for s in raiz["subcategorias"]} == {hobby["id"]}


def test_sub_de_b_com_nome_igual_a_sub_de_a_em_outra_raiz_nao_e_fundida(fab, relogio):
    relogio(HOJE)
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    _criar_cat(a.cliente, "Extras", pai=_raiz(a.cliente, "Gastos fixos")["id"])
    _criar_cat(b.cliente, "Extras", pai=_raiz(b.cliente, "Gastos variáveis")["id"])
    _vincular(a, b)
    assert _sub(a.cliente, "Gastos fixos", "Extras")["id"] != _sub(a.cliente, "Gastos variáveis", "Extras")["id"]


def test_nomes_que_diferem_so_no_acento_nao_pareiam_pela_collation_do_join(fab, relogio):
    relogio(HOJE)
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    _criar_cat(a.cliente, "Cafe")
    _criar_cat(b.cliente, "Café")
    _criar_tag(a.cliente, "cafe")
    _criar_tag(b.cliente, "café")
    _vincular(a, b)
    nomes = [c["nome"] for c in _cats(a.cliente)]
    assert "Cafe" in nomes and "Café" in nomes
    assert {"cafe", "café"} <= {t["nome"] for t in _tags(a.cliente)}


def test_nomes_que_diferem_so_na_caixa_pareiam_e_ficam_com_a_grafia_de_a(fab, relogio):
    relogio(HOJE)
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    _criar_cat(a.cliente, "Pet Shop")
    _criar_cat(b.cliente, "PET SHOP")
    _vincular(a, b)
    nomes = [c["nome"] for c in _cats(b.cliente)]
    assert "Pet Shop" in nomes and "PET SHOP" not in nomes


def test_mesmo_nome_com_tipos_diferentes_nao_pareia(fab, relogio):
    relogio(HOJE)
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    _criar_cat(a.cliente, "Extra", tipo="despesa")
    _criar_cat(b.cliente, "Extra", tipo="receita")
    _vincular(a, b)
    assert _raiz(a.cliente, "Extra", "despesa")["tipo"] == "despesa"
    assert _raiz(a.cliente, "Extra", "receita")["tipo"] == "receita"


def test_apos_o_vinculo_nenhum_lancamento_perde_a_categoria(uniao):
    _, a, b, d = uniao
    for cli, chave in ((a.cliente, "lanc_a"), (b.cliente, "lanc_b_pets"), (b.cliente, "lanc_b_hotel")):
        assert _lanc(cli, d[chave]["id"])["categoria"] is not None


# ---------------------------------------------------------------- união de tags

def test_tags_casa_de_a_e_Casa_de_b_viram_uma_so_tag_casa_e_obra_se_soma(uniao):
    _, a, b, _ = uniao
    for cli in (a.cliente, b.cliente):
        nomes = sorted(t["nome"] for t in _tags(cli))
        assert nomes == ["casa", "obra"]


def test_tag_repetida_no_mesmo_lancamento_antes_da_uniao_fica_uma_so_ligacao(cenario, sessao_direta):
    _, a, b, d = cenario
    # Situação inalcançável pela API: o lançamento de A com a tag casa de A e também a Casa de B.
    db = sessao_direta()
    db.execute(
        text("INSERT INTO lancamento_tag (lancamento_id, tag_id) VALUES (:l, :t)"),
        {"l": d["lanc_a"]["id"], "t": d["tag_b_casa"]["id"]},
    )
    db.commit()
    _vincular(a, b)
    lanc = _lanc(a.cliente, d["lanc_a"]["id"])
    assert [t["nome"] for t in lanc["tags"]] == ["casa"]
    db2 = sessao_direta()
    total = db2.execute(
        text("SELECT COUNT(*) FROM lancamento_tag WHERE lancamento_id = :l"),
        {"l": d["lanc_a"]["id"]},
    ).scalar_one()
    assert total == 1
    assert db2.execute(
        text("SELECT COUNT(*) FROM tag WHERE id = :t"), {"t": d["tag_b_casa"]["id"]}
    ).scalar_one() == 0


def test_uniao_preserva_todas_as_ligacoes_de_tag_que_nao_eram_repetidas(cenario, sessao_direta):
    _, a, b, _ = cenario
    db = sessao_direta()
    antes = db.execute(text("SELECT COUNT(*) FROM lancamento_tag")).scalar_one()
    assert antes == 2
    db.rollback()
    _vincular(a, b)
    depois = sessao_direta().execute(text("SELECT COUNT(*) FROM lancamento_tag")).scalar_one()
    assert depois == antes


def test_apos_o_vinculo_nao_resta_categoria_nem_tag_pessoal(uniao, sessao_direta):
    _, a, b, _ = uniao
    db = sessao_direta()
    for tabela in ("categoria", "tag"):
        n = db.execute(
            text(f"SELECT COUNT(*) FROM `{tabela}` WHERE usuario_id IN (:a, :b)"),
            {"a": a.id, "b": b.id},
        ).scalar_one()
        assert n == 0, tabela


# ---------------------------------------------------------------- rollback

def _contagens(db, a_id, b_id):
    q = lambda sql, **p: db.execute(text(sql), p).scalar_one()
    return {
        "casais": q("SELECT COUNT(*) FROM casal"),
        "conjuntas": q("SELECT COUNT(*) FROM conta WHERE casal_id IS NOT NULL"),
        "cat_casal": q("SELECT COUNT(*) FROM categoria WHERE casal_id IS NOT NULL"),
        "tag_casal": q("SELECT COUNT(*) FROM tag WHERE casal_id IS NOT NULL"),
        "cat_a": q("SELECT COUNT(*) FROM categoria WHERE usuario_id = :u", u=a_id),
        "cat_b": q("SELECT COUNT(*) FROM categoria WHERE usuario_id = :u", u=b_id),
        "tag_a": q("SELECT COUNT(*) FROM tag WHERE usuario_id = :u", u=a_id),
        "tag_b": q("SELECT COUNT(*) FROM tag WHERE usuario_id = :u", u=b_id),
        "ligacoes": q("SELECT COUNT(*) FROM lancamento_tag"),
    }


def test_falha_no_meio_do_vinculo_desfaz_conta_conjunta_categorias_e_casal(
    cenario, sessao_direta, monkeypatch
):
    _, a, b, d = cenario
    convite = _json(a.cliente.post("/api/convites", json={"email": b.email}), 201)["id"]
    antes = _contagens(sessao_direta(), a.id, b.id)

    def explode(db, b_id, c_id):
        raise RuntimeError("falha injetada depois da união de categorias")

    monkeypatch.setattr(vinculo_dados, "_unir_tags", explode)
    db = sessao_direta()
    with pytest.raises(RuntimeError, match="falha injetada"):
        vinculo.aceitar_convite(db, contexto_do_usuario(db, b.id), convite)
    db.rollback()

    assert _contagens(sessao_direta(), a.id, b.id) == antes
    assert _json(b.cliente.get("/api/vinculo"))["estado"] == "convite_recebido"
    assert _json(a.cliente.get("/api/vinculo"))["estado"] == "convite_enviado"
    assert _lanc(b.cliente, d["lanc_b_pets"]["id"])["categoria"]["id"] == d["pets_b"]["id"]

    monkeypatch.undo()  # sem a falha, o mesmo convite pode ser aceito: nada ficou pendurado
    assert _json(b.cliente.post(f"/api/convites/{convite}/aceitar"))["estado"] == "vinculado"
    assert _foto(a.cliente) == _foto(b.cliente)


def test_falha_no_meio_do_desvinculo_desfaz_arquivamento_e_copias(
    fab, relogio, sessao_direta, monkeypatch
):
    relogio(HOJE)
    c = fab.um_casal()
    _criar_cat(c.a.cliente, "Pets")
    _criar_tag(c.a.cliente, "casa")
    antes = _contagens(sessao_direta(), c.a.id, c.b.id)
    original = vinculo_dados._copiar_tags
    chamadas = []

    def falha_na_segunda(db, casal_id, pessoa_id):
        chamadas.append(pessoa_id)
        if len(chamadas) == 2:
            raise RuntimeError("falha injetada na cópia da segunda pessoa")
        return original(db, casal_id, pessoa_id)

    monkeypatch.setattr(vinculo_dados, "_copiar_tags", falha_na_segunda)
    db = sessao_direta()
    with pytest.raises(RuntimeError, match="falha injetada"):
        vinculo.desvincular(db, contexto_do_usuario(db, c.a.id), True)
    db.rollback()

    verif = sessao_direta()
    assert _contagens(verif, c.a.id, c.b.id) == antes
    assert verif.execute(text("SELECT encerrado_em FROM casal")).scalar_one() is None
    assert verif.execute(
        text("SELECT arquivado FROM conta WHERE casal_id IS NOT NULL")
    ).scalar_one() == 0
    assert _json(c.a.cliente.get("/api/vinculo"))["estado"] == "vinculado"
    assert any(x["nome"] == "Conta conjunta" for x in _json(c.b.cliente.get("/api/contas"))["contas"])

    monkeypatch.undo()
    assert _json(c.a.cliente.post("/api/vinculo/desvincular", json={"confirmar": True}))["estado"] == "sem_vinculo"


def test_desvinculo_de_casal_sem_conta_conjunta_nao_termina_em_erro_interno(
    fab, relogio, sessao_direta
):
    """S2 da t96r: `.one()` sem conjunta levanta NoResultFound (500). Esperado: erro controlado ou êxito."""
    relogio(HOJE)
    c = fab.um_casal()
    db = sessao_direta()
    db.execute(text("DELETE FROM conta WHERE casal_id IS NOT NULL"))
    db.commit()
    db = sessao_direta()
    try:
        vinculo.desvincular(db, contexto_do_usuario(db, c.a.id), True)
    except NoResultFound:
        db.rollback()
        pytest.fail("desvincular casal sem conta conjunta levantou NoResultFound (vira 500)")
    except AppError:
        db.rollback()


# ---------------------------------------------------------------- desvínculo: conta conjunta (CA-1.10)

@pytest.fixture
def casal_com_conjunta(fab, relogio):
    relogio(HOJE)
    c = fab.um_casal()
    cat = _raiz(c.a.cliente, "Moradia/Casa")["id"]
    conjunta = _conta(c.a.cliente, conjunta=True)
    pago = _lancar(c.a.cliente, c.a.id, cat, conjunta=True)
    previsto = _lancar(c.a.cliente, c.a.id, cat, conjunta=True, situacao="prevista", dia="2026-03-20")
    return fab, c, conjunta, pago, previsto, cat


def test_desvinculo_arquiva_a_conjunta_para_as_duas_pessoas(casal_com_conjunta):
    _, c, conjunta, *_ = casal_com_conjunta
    _desvincular(c.a)
    for p in (c.a, c.b):
        principal = _json(p.cliente.get("/api/contas"))["contas"]
        assert conjunta["id"] not in [x["id"] for x in principal]
        arquivadas = _json(p.cliente.get("/api/contas", params={"arquivadas": True}))["contas"]
        achada = next(x for x in arquivadas if x["id"] == conjunta["id"])
        assert achada["arquivado"] is True and achada["casal_encerrado"] is True


def test_conjunta_arquivada_mantem_consulta_de_lancamentos_e_saldo(casal_com_conjunta):
    _, c, conjunta, pago, *_ = casal_com_conjunta
    saldo_antes = _json(c.a.cliente.get(f"/api/contas/{conjunta['id']}"))["saldo_atual"]
    _desvincular(c.a)
    for p in (c.a, c.b):
        conta = _json(p.cliente.get(f"/api/contas/{conjunta['id']}"))
        assert conta["saldo_atual"] == saldo_antes == "-10.00"
        lancs = _json(
            p.cliente.get("/api/lancamentos", params={"mes": "2026-03", "conta_id": conjunta["id"]})
        )
        assert pago["id"] in [x["id"] for x in lancs]
        assert _lanc(p.cliente, pago["id"])["conta_id"] == conjunta["id"]


def test_conjunta_arquivada_recusa_criar_editar_excluir_e_confirmar(casal_com_conjunta):
    _, c, conjunta, pago, previsto, cat = casal_com_conjunta
    _desvincular(c.a)
    for p in (c.a, c.b):
        cli = p.cliente
        r = cli.post(
            "/api/lancamentos",
            json={
                "tipo": "despesa", "valor": "1.00", "data": "2026-03-10", "descricao": "novo",
                "categoria_id": cat, "dono_usuario_id": None, "conta_id": conjunta["id"],
            },
        )
        assert r.status_code in (409, 422), r.text
        for r in (
            cli.patch(f"/api/lancamentos/{pago['id']}", json={"descricao": "mudou"}),
            cli.delete(f"/api/lancamentos/{pago['id']}"),
            cli.post(f"/api/lancamentos/{previsto['id']}/confirmar", json={}),
        ):
            assert r.status_code == 409, r.text
            assert r.json()["erro"]["codigo"] == "CONTA_ARQUIVADA"
    assert _lanc(c.a.cliente, pago["id"])["descricao"] == "lanc"
    assert _lanc(c.a.cliente, previsto["id"])["situacao"] == "prevista"


def test_conjunta_de_casal_encerrado_nao_pode_ser_desarquivada_nem_editada(casal_com_conjunta):
    _, c, conjunta, *_ = casal_com_conjunta
    _desvincular(c.a)
    r = c.a.cliente.post(f"/api/contas/{conjunta['id']}/desarquivar")
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "CONTA_DE_CASAL_ENCERRADO"
    r = c.a.cliente.patch(f"/api/contas/{conjunta['id']}", json={"nome": "x"})
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "CONTA_ARQUIVADA"


def test_contas_individuais_permanecem_com_o_dono_e_nao_ficam_visiveis_ao_outro(fab, relogio):
    relogio(HOJE)
    c = fab.um_casal()
    cat = _raiz(c.a.cliente, "Moradia/Casa")["id"]
    lanc_a = _lancar(c.a.cliente, c.a.id, cat)
    lanc_b = _lancar(c.b.cliente, c.b.id, _raiz(c.b.cliente, "Moradia/Casa")["id"])
    ind_a, ind_b = _conta(c.a.cliente, dono=c.a.id), _conta(c.b.cliente, dono=c.b.id)
    # Antes: cada uma vê a individual da outra.
    assert ind_b["id"] in [x["id"] for x in _json(c.a.cliente.get("/api/contas"))["contas"]]
    _desvincular(c.a)
    assert [x["id"] for x in _json(c.a.cliente.get("/api/contas"))["contas"]] == [ind_a["id"]]
    assert [x["id"] for x in _json(c.b.cliente.get("/api/contas"))["contas"]] == [ind_b["id"]]
    assert c.a.cliente.get(f"/api/contas/{ind_b['id']}").status_code == 404
    assert c.b.cliente.get(f"/api/lancamentos/{lanc_a['id']}").status_code == 404
    assert c.a.cliente.get(f"/api/lancamentos/{lanc_b['id']}").status_code == 404
    assert _lanc(c.a.cliente, lanc_a["id"])["conta_id"] == ind_a["id"]
    assert _lanc(c.b.cliente, lanc_b["id"])["conta_id"] == ind_b["id"]


def test_desvinculo_sem_confirmar_e_recusado_e_nada_muda(fab):
    c = fab.um_casal()
    r = c.a.cliente.post("/api/vinculo/desvincular", json={"confirmar": False})
    assert r.status_code == 422 and r.json()["erro"]["codigo"] == "VALIDACAO"
    assert "confirmar" in r.json()["erro"]["campos"]
    assert c.a.cliente.post("/api/vinculo/desvincular", json={}).status_code == 422
    assert _json(c.b.cliente.get("/api/vinculo"))["estado"] == "vinculado"
    assert not _conta(c.a.cliente, conjunta=True)["arquivado"]


def test_desvincular_sem_vinculo_e_conflito(fab):
    p = fab.uma_pessoa()
    r = p.cliente.post("/api/vinculo/desvincular", json={"confirmar": True})
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "SEM_VINCULO"


def test_depois_do_desvinculo_as_duas_ficam_aptas_a_novo_convite(fab):
    c = fab.um_casal()
    estado = _desvincular(c.a)
    assert estado["estado"] == "sem_vinculo" and estado["parceiro"] is None
    assert _json(c.b.cliente.get("/api/vinculo"))["estado"] == "sem_vinculo"
    _vincular(c.b, c.a)  # agora B convida A: aceito


def test_novo_vinculo_das_mesmas_pessoas_cria_nova_conjunta_vazia_e_mantem_a_antiga(casal_com_conjunta):
    _, c, antiga, pago, *_ = casal_com_conjunta
    _desvincular(c.a)
    _vincular(c.a, c.b)
    contas = _json(c.a.cliente.get("/api/contas"))["contas"]
    nova = next(x for x in contas if x["dono_usuario_id"] is None)
    assert nova["id"] != antiga["id"] and nova["nome"] == "Conta conjunta"
    assert nova["saldo_atual"] == "0.00" and nova["saldo_inicial"] == "0.00"
    lancs_nova = _json(
        c.b.cliente.get("/api/lancamentos", params={"mes": "2026-03", "conta_id": nova["id"]})
    )
    assert lancs_nova == []
    arquivadas = _json(c.b.cliente.get("/api/contas", params={"arquivadas": True}))["contas"]
    velha = next(x for x in arquivadas if x["id"] == antiga["id"])
    assert velha["arquivado"] is True and velha["saldo_atual"] == "-10.00"
    assert _lanc(c.b.cliente, pago["id"])["conta_id"] == antiga["id"]


# ---------------------------------------------------------------- desvínculo: cópia das listas

def test_cada_pessoa_recebe_copia_exata_da_lista_do_casal_inclusive_arquivadas(uniao):
    _, a, b, _ = uniao
    do_casal = _foto(a.cliente)
    assert any(arq for (_, _, _, _, _, arq, _) in do_casal[0])  # há arquivadas no cenário
    _desvincular(a)
    assert _foto(a.cliente) == do_casal
    assert _foto(b.cliente) == do_casal


def test_copias_de_a_e_b_sao_independentes_com_ids_proprios(uniao):
    _, a, b, _ = uniao
    ids_casal = _ids(a.cliente)
    _desvincular(a)
    ids_a, ids_b = _ids(a.cliente), _ids(b.cliente)
    for i in (0, 1):
        assert not ids_a[i] & ids_b[i]
        assert not ids_a[i] & ids_casal[i] and not ids_b[i] & ids_casal[i]


def test_editar_a_copia_de_uma_pessoa_nao_altera_a_da_outra(uniao):
    _, a, b, _ = uniao
    _desvincular(a)
    _renomear_cat(a.cliente, _raiz(a.cliente, "Pets")["id"], "Bichos")
    r = a.cliente.patch(f"/api/tags/{_tag(a.cliente, 'casa')['id']}", json={"nome": "lar"})
    assert r.status_code == 200, r.text
    _arquivar_cat(a.cliente, _raiz(a.cliente, "Investimento")["id"])
    assert _raiz(b.cliente, "Pets")["nome"] == "Pets"
    assert "casa" in [t["nome"] for t in _tags(b.cliente)]
    assert _raiz(b.cliente, "Investimento")["arquivado"] is False


def test_lancamentos_individuais_passam_para_a_copia_de_cada_pessoa(uniao):
    _, a, b, d = uniao
    casal_pets = _raiz(a.cliente, "Pets")["id"]
    casal_tag = _tag(a.cliente, "casa")["id"]
    _desvincular(a)
    lanc_a = _lanc(a.cliente, d["lanc_a"]["id"])
    lanc_b = _lanc(b.cliente, d["lanc_b_pets"]["id"])
    assert lanc_a["categoria"]["id"] == _raiz(a.cliente, "Pets")["id"] != casal_pets
    assert lanc_b["categoria"]["id"] == _raiz(b.cliente, "Pets")["id"] != casal_pets
    assert lanc_a["categoria"]["id"] != lanc_b["categoria"]["id"]
    assert [(t["id"], t["nome"]) for t in lanc_a["tags"]] == [(_tag(a.cliente, "casa")["id"], "casa")]
    assert [(t["id"], t["nome"]) for t in lanc_b["tags"]] == [(_tag(b.cliente, "casa")["id"], "casa")]
    assert lanc_a["tags"][0]["id"] != casal_tag != lanc_b["tags"][0]["id"]


def test_subcategoria_copiada_mantem_o_pai_da_copia(uniao):
    _, a, b, _ = uniao
    _desvincular(a)
    for p in (a, b):
        raiz = _raiz(p.cliente, "Viagem")
        assert {s["categoria_pai_id"] for s in raiz["subcategorias"]} == {raiz["id"]}
        assert sorted(s["nome"] for s in raiz["subcategorias"]) == ["Hotel", "Taxi", "Voo"]


def test_lancamento_da_conjunta_segue_legivel_com_categoria_e_tag_do_casal_encerrado(fab, relogio):
    relogio(HOJE)
    c = fab.um_casal()
    pets = _criar_cat(c.a.cliente, "Pets")
    casa = _criar_tag(c.a.cliente, "casa")
    conjunta = _lancar(c.a.cliente, c.a.id, pets["id"], conjunta=True, tags=[casa["id"]])
    individual = _lancar(c.b.cliente, c.b.id, pets["id"], tags=[casa["id"]])
    _desvincular(c.a)
    for p in (c.a, c.b):
        lanc = _lanc(p.cliente, conjunta["id"])
        assert lanc["categoria"]["id"] == pets["id"] and lanc["categoria"]["nome"] == "Pets"
        assert [t["nome"] for t in lanc["tags"]] == ["casa"]
        assert pets["id"] not in _ids(p.cliente)[0]  # a lista do casal encerrado não é listada
        assert casa["id"] not in _ids(p.cliente)[1]
    # O lançamento da individual de B, porém, foi para a cópia de B.
    ind = _lanc(c.b.cliente, individual["id"])
    assert ind["categoria"]["id"] == _raiz(c.b.cliente, "Pets")["id"] != pets["id"]
    assert ind["tags"][0]["id"] == _tag(c.b.cliente, "casa")["id"] != casa["id"]


def test_lista_do_casal_encerrado_nao_e_editavel_por_id(fab, relogio):
    relogio(HOJE)
    c = fab.um_casal()
    pets = _criar_cat(c.a.cliente, "Pets")
    casa = _criar_tag(c.a.cliente, "casa")
    _desvincular(c.a)
    for p in (c.a, c.b):
        assert p.cliente.patch(f"/api/categorias/{pets['id']}", json={"nome": "x"}).status_code == 404
        assert p.cliente.patch(f"/api/tags/{casa['id']}", json={"nome": "x"}).status_code == 404
        assert p.cliente.delete(f"/api/tags/{casa['id']}").status_code == 404


def test_desvinculo_com_varios_lancamentos_e_tags_nas_individuais_roda_sem_erro_1093(fab, relogio):
    relogio(HOJE)
    c = fab.um_casal()
    cat = _criar_cat(c.a.cliente, "Pets")
    tags = [_criar_tag(c.a.cliente, f"t{i}")["id"] for i in range(3)]
    for p in (c.a, c.b):
        for _ in range(3):
            _lancar(p.cliente, p.id, cat["id"], tags=tags)
    _desvincular(c.a)
    for p in (c.a, c.b):
        lancs = _json(p.cliente.get("/api/lancamentos", params={"mes": "2026-03"}))
        proprios = [x for x in lancs if x["dono_usuario_id"] == p.id]
        assert len(proprios) == 3
        ids_cats, ids_tags = _ids(p.cliente)
        for x in proprios:
            assert x["categoria"]["id"] in ids_cats
            assert {t["id"] for t in x["tags"]} <= ids_tags and len(x["tags"]) == 3


# ---------------------------------------------------------------- novo vínculo

def test_novo_vinculo_das_mesmas_pessoas_une_as_copias_e_volta_a_mesma_lista(uniao):
    _, a, b, _ = uniao
    primeira = _foto(a.cliente)
    _desvincular(a)
    _vincular(a, b)
    assert _foto(a.cliente) == primeira == _foto(b.cliente)


def test_novo_vinculo_com_outra_pessoa_une_a_lista_dela_do_mesmo_jeito(uniao):
    fab, a, b, d = uniao
    _desvincular(a)
    copia_de_b = _foto(b.cliente)
    c = fab.uma_pessoa("Caio")
    _renomear_cat(c.cliente, _sub(c.cliente, "Gastos variáveis", "Mercado")["id"], "MERCADO")
    _criar_cat(c.cliente, "Zeta")
    _criar_cat(c.cliente, "pets", cor=AZUL, icone="fish")
    _criar_tag(c.cliente, "Obra")
    _criar_tag(c.cliente, "nova")
    _vincular(a, c)
    cats = [x["nome"] for x in _cats(a.cliente)]
    assert cats.count("Pets") == 1 and "Zeta" in cats and "pets" not in cats
    assert [s["nome"] for s in _raiz(a.cliente, "Gastos variáveis")["subcategorias"]].count("Mercado") == 1
    assert sorted(t["nome"] for t in _tags(c.cliente)) == ["casa", "nova", "obra"]
    assert _foto(a.cliente) == _foto(c.cliente)
    assert _raiz(c.cliente, "Pets")["cor"] == VERMELHO  # grafia, cor e ícone de A (convidante)
    assert _foto(b.cliente) == copia_de_b  # a cópia de B não é tocada
    assert _lanc(a.cliente, d["lanc_a"]["id"])["categoria"]["nome"] == "Pets"
