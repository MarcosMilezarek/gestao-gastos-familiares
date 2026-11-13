"""Fatia 2: CHECK, UNIQUE, FK RESTRICT e tipos com MySQL real (roteiro de docs/revisoes/t87r.md).

Os nomes das constraints e as colunas já são conferidos em `test_migracoes.py`; aqui o foco é o
que o MySQL realmente recusa ou aceita ao gravar pelo SQL direto, sem passar pelos services.
"""
import time
from decimal import Decimal

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DataError, IntegrityError, OperationalError

ERR_CHECK = 3819
ERR_DUPLICADO = 1062
ERR_FK_FILHO = 1452
ERR_FK_PAI = 1451


# ------------------------------------------------------------------ apoio

def _sql(sessao_direta, comando: str, **params):
    db = sessao_direta()
    try:
        r = db.execute(text(comando), params)
        db.commit()
        return r
    finally:
        db.close()


def _recusa(sessao_direta, comando: str, codigo: int, restricao: str | None = None, **params):
    """Executa o SQL, espera IntegrityError/DataError com este errno e (opcional) nome na mensagem."""
    db = sessao_direta()
    try:
        with pytest.raises((IntegrityError, DataError, OperationalError)) as exc:
            db.execute(text(comando), params)
            db.commit()
        db.rollback()
    finally:
        db.close()
    assert exc.value.orig.args[0] == codigo, exc.value
    if restricao:
        assert restricao in str(exc.value.orig), exc.value


def _escalar(sessao_direta, comando: str, **params):
    db = sessao_direta()
    try:
        return db.execute(text(comando), params).scalar()
    finally:
        db.close()


def _categoria_id(cliente, nome="Mercado", tipo="despesa") -> int:
    for raiz in cliente.get("/api/categorias", params={"tipo": tipo}).json():
        for no in [raiz, *raiz["subcategorias"]]:
            if no["nome"] == nome:
                return no["id"]
    raise AssertionError(nome)


@pytest.fixture
def cenario(fab):
    """Casal com um lançamento de despesa (via rota) e os ids relevantes."""
    c = fab.um_casal()
    contas = c.a.cliente.get("/api/contas").json()["contas"]
    minha = next(x for x in contas if x["dono_usuario_id"] == c.a.id)
    outra = next(x for x in contas if x["dono_usuario_id"] == c.b.id)
    conjunta = next(x for x in contas if x["dono_usuario_id"] is None)
    cat = _categoria_id(c.a.cliente)
    r = c.a.cliente.post(
        "/api/lancamentos",
        json={"tipo": "despesa", "valor": "10.00", "data": "2026-03-10", "descricao": "x",
              "categoria_id": cat, "dono_usuario_id": c.a.id, "conta_id": minha["id"],
              "situacao": "confirmada"},
    )
    assert r.status_code == 201, r.text
    return {"casal": c, "minha": minha["id"], "outra": outra["id"], "conjunta": conjunta["id"],
            "cat": cat, "lancamento": r.json()["id"]}


_LANC = (
    "INSERT INTO lancamento (tipo, valor, data, situacao, descricao, conta_id, conta_destino_id, "
    "categoria_id, dono_usuario_id, criado_por_id) "
    "VALUES (:tipo, :valor, '2026-03-10', :situacao, 'x', :conta, :destino, :cat, :dono, :criador)"
)


def _lanc(cn, **kw):
    base = {"tipo": "despesa", "valor": "10.00", "situacao": "confirmada", "conta": cn["minha"],
            "destino": None, "cat": cn["cat"], "dono": cn["casal"].a.id,
            "criador": cn["casal"].a.id}
    base.update(kw)
    return base


# ------------------------------------------------------------------ conta

def test_ck_conta_dono_recusa_conta_sem_dono(cenario, sessao_direta):
    _recusa(
        sessao_direta,
        "INSERT INTO conta (usuario_id, casal_id, nome, tipo, cor) "
        "VALUES (NULL, NULL, 'x', 'outros', '#000000')",
        ERR_CHECK, "ck_conta_dono",
    )


def test_ck_conta_dono_recusa_conta_com_dois_donos(cenario, sessao_direta):
    c = cenario["casal"]
    _recusa(
        sessao_direta,
        "INSERT INTO conta (usuario_id, casal_id, nome, tipo, cor) "
        "VALUES (:u, :c, 'x', 'outros', '#000000')",
        ERR_CHECK, "ck_conta_dono", u=c.a.id, c=c.id,
    )


def test_ck_conta_tipo_recusa_tipo_fora_da_lista(cenario, sessao_direta):
    _recusa(
        sessao_direta,
        "UPDATE conta SET tipo = 'cartao' WHERE id = :i",
        ERR_CHECK, "ck_conta_tipo", i=cenario["minha"],
    )


def test_uq_conta_usuario_id_recusa_segunda_conta_individual(cenario, sessao_direta):
    _recusa(
        sessao_direta,
        "INSERT INTO conta (usuario_id, nome, tipo, cor) VALUES (:u, 'dup', 'outros', '#000000')",
        ERR_DUPLICADO, "uq_conta_usuario_id", u=cenario["casal"].a.id,
    )


def test_uq_conta_casal_id_recusa_segunda_conta_conjunta(cenario, sessao_direta):
    _recusa(
        sessao_direta,
        "INSERT INTO conta (casal_id, nome, tipo, cor) VALUES (:c, 'dup', 'outros', '#000000')",
        ERR_DUPLICADO, "uq_conta_casal_id", c=cenario["casal"].id,
    )


def test_varias_contas_com_dono_nulo_no_outro_lado_nao_colidem(fab, sessao_direta):
    """NULL não colide no UNIQUE: dois casais têm cada um uma conjunta (usuario_id NULL) e
    cada pessoa uma individual (casal_id NULL)."""
    fab.dois_casais()
    assert _escalar(sessao_direta, "SELECT COUNT(*) FROM conta WHERE usuario_id IS NULL") == 2
    assert _escalar(sessao_direta, "SELECT COUNT(*) FROM conta WHERE casal_id IS NULL") == 4


def test_conta_aceita_saldo_inicial_negativo_e_default_zero(cenario, sessao_direta):
    _sql(sessao_direta, "UPDATE conta SET saldo_inicial = -50.00 WHERE id = :i", i=cenario["minha"])
    assert _escalar(sessao_direta, "SELECT saldo_inicial FROM conta WHERE id = :i",
                    i=cenario["minha"]) == Decimal("-50.00")
    assert _escalar(sessao_direta, "SELECT saldo_inicial FROM conta WHERE id = :i",
                    i=cenario["outra"]) == Decimal("0.00")


# ------------------------------------------------------------------ lancamento

@pytest.mark.parametrize(
    "kw",
    [
        {"tipo": "despesa", "valor": "0.00"},
        {"tipo": "despesa", "valor": "-1.00"},
        {"tipo": "receita", "valor": "0.00"},
        {"tipo": "reajuste", "valor": "0.00", "cat": None, "dono": None},
    ],
)
def test_ck_lancamento_valor_recusa_zero_e_negativo(cenario, sessao_direta, kw):
    _recusa(sessao_direta, _LANC, ERR_CHECK, "ck_lancamento_valor", **_lanc(cenario, **kw))


def test_ck_lancamento_valor_aceita_reajuste_negativo_e_positivo(cenario, sessao_direta):
    for v in ("-5.00", "5.00"):
        _sql(sessao_direta, _LANC, **_lanc(cenario, tipo="reajuste", valor=v, cat=None, dono=None))
    assert _escalar(sessao_direta, "SELECT COUNT(*) FROM lancamento WHERE tipo = 'reajuste'") == 2


def test_ck_lancamento_tipo_recusa_tipo_desconhecido(cenario, sessao_direta):
    _recusa(sessao_direta, _LANC, ERR_CHECK, "ck_lancamento_tipo", **_lanc(cenario, tipo="doacao", cat=None, dono=None))


def test_ck_lancamento_situacao_recusa_atrasada(cenario, sessao_direta):
    _recusa(sessao_direta, _LANC, ERR_CHECK, "ck_lancamento_situacao",
            **_lanc(cenario, situacao="atrasada"))


def test_ck_lancamento_reajuste_recusa_reajuste_previsto(cenario, sessao_direta):
    _recusa(sessao_direta, _LANC, ERR_CHECK, "ck_lancamento_reajuste",
            **_lanc(cenario, tipo="reajuste", situacao="prevista", cat=None, dono=None))


@pytest.mark.parametrize(
    "kw",
    [
        {"tipo": "transferencia", "cat": None, "dono": None, "destino": None},  # sem destino
        {"destino": "outra"},  # despesa com destino
        {"tipo": "transferencia", "cat": None, "dono": None, "destino": "minha"},  # origem = destino
    ],
)
def test_ck_lancamento_destino(cenario, sessao_direta, kw):
    kw = dict(kw)
    if kw.get("destino") in ("outra", "minha"):
        kw["destino"] = cenario[kw["destino"]]
    _recusa(sessao_direta, _LANC, ERR_CHECK, "ck_lancamento_destino", **_lanc(cenario, **kw))


def test_transferencia_valida_e_aceita(cenario, sessao_direta):
    _sql(sessao_direta, _LANC,
         **_lanc(cenario, tipo="transferencia", cat=None, dono=None, destino=cenario["conjunta"]))


@pytest.mark.parametrize(
    "kw",
    [
        {"tipo": "despesa", "cat": None},
        {"tipo": "transferencia", "destino": "conjunta", "dono": None},  # transferência com categoria
    ],
)
def test_ck_lancamento_categoria(cenario, sessao_direta, kw):
    kw = dict(kw)
    if kw.get("destino") == "conjunta":
        kw["destino"] = cenario["conjunta"]
    _recusa(sessao_direta, _LANC, ERR_CHECK, "ck_lancamento_categoria", **_lanc(cenario, **kw))


def test_ck_lancamento_dono_recusa_dono_em_transferencia_e_reajuste(cenario, sessao_direta):
    _recusa(sessao_direta, _LANC, ERR_CHECK, "ck_lancamento_dono",
            **_lanc(cenario, tipo="transferencia", cat=None, destino=cenario["conjunta"]))
    _recusa(sessao_direta, _LANC, ERR_CHECK, "ck_lancamento_dono",
            **_lanc(cenario, tipo="reajuste", cat=None))


# ------------------------------------------------------------------ FKs RESTRICT

def test_fk_recusa_lancamento_com_conta_ou_categoria_inexistente(cenario, sessao_direta):
    _recusa(sessao_direta, _LANC, ERR_FK_FILHO, "fk_lancamento_conta_id",
            **_lanc(cenario, conta=999999))
    _recusa(sessao_direta, _LANC, ERR_FK_FILHO, "fk_lancamento_categoria_id",
            **_lanc(cenario, cat=999999))
    _recusa(sessao_direta, _LANC, ERR_FK_FILHO, "fk_lancamento_criado_por_id",
            **_lanc(cenario, criador=999999))


def test_restrict_recusa_apagar_conta_com_lancamento(cenario, sessao_direta):
    _recusa(sessao_direta, "DELETE FROM conta WHERE id = :i", ERR_FK_PAI,
            "fk_lancamento_conta_id", i=cenario["minha"])


def test_restrict_recusa_apagar_conta_usada_como_destino(cenario, sessao_direta):
    _sql(sessao_direta, _LANC,
         **_lanc(cenario, tipo="transferencia", cat=None, dono=None, destino=cenario["conjunta"]))
    _recusa(sessao_direta, "DELETE FROM conta WHERE id = :i", ERR_FK_PAI,
            "fk_lancamento_conta_destino_id", i=cenario["conjunta"])


def test_restrict_recusa_apagar_categoria_com_lancamento(cenario, sessao_direta):
    _recusa(sessao_direta, "DELETE FROM categoria WHERE id = :i", ERR_FK_PAI,
            "fk_lancamento_categoria_id", i=cenario["cat"])


def test_restrict_recusa_apagar_usuario_e_casal_com_contas(cenario, sessao_direta):
    c = cenario["casal"]
    _recusa(sessao_direta, "DELETE FROM usuario WHERE id = :i", ERR_FK_PAI, i=c.a.id)
    _recusa(sessao_direta, "DELETE FROM casal WHERE id = :i", ERR_FK_PAI, i=c.id)


def test_restrict_recusa_apagar_tag_e_lancamento_ligados(cenario, sessao_direta):
    c = cenario["casal"]
    r = c.a.cliente.post("/api/tags", json={"nome": "essencial"})
    assert r.status_code == 201, r.text
    tag_id = r.json()["id"]
    r = c.a.cliente.patch(f"/api/lancamentos/{cenario['lancamento']}", json={"tag_ids": [tag_id]})
    assert r.status_code == 200, r.text
    _recusa(sessao_direta, "DELETE FROM tag WHERE id = :i", ERR_FK_PAI, i=tag_id)
    _recusa(sessao_direta, "DELETE FROM lancamento WHERE id = :i", ERR_FK_PAI, i=cenario["lancamento"])


def test_apagar_lancamento_sem_vinculos_e_permitido_pelo_banco(cenario, sessao_direta):
    _sql(sessao_direta, "DELETE FROM lancamento WHERE id = :i", i=cenario["lancamento"])
    assert _escalar(sessao_direta, "SELECT COUNT(*) FROM lancamento") == 0


# ------------------------------------------------------------------ tipos e precisão

def test_mapped_bool_sobre_tinyint1_devolve_inteiro_pelo_sql_e_serializa_bool_na_api(
    cenario, sessao_direta
):
    """S1 (t87r): `arquivado` é TINYINT(1); o SQL devolve 0/1 e a comparação por valor funciona;
    a API devolve JSON booleano."""
    from app.models.conta import Conta

    db = sessao_direta()
    conta = db.scalar(select(Conta).where(Conta.id == cenario["minha"]))
    assert conta.arquivado == 0 and not conta.arquivado
    db.close()
    assert _escalar(sessao_direta, "SELECT arquivado FROM conta WHERE id = :i",
                    i=cenario["minha"]) == 0
    cenario["casal"].a.cliente.post(f"/api/contas/{cenario['minha']}/arquivar")
    db = sessao_direta()
    conta = db.scalar(select(Conta).where(Conta.id == cenario["minha"]))
    assert conta.arquivado == 1 and conta.arquivado
    assert isinstance(conta.arquivado, int)
    db.close()
    corpo = cenario["casal"].a.cliente.get(f"/api/contas/{cenario['minha']}").json()
    assert corpo["arquivado"] is True


def test_decimal_dez_mais_vinte_centavos_soma_trinta_sem_ponto_flutuante(cenario, sessao_direta):
    for v in ("0.10", "0.20"):
        _sql(sessao_direta, _LANC, **_lanc(cenario, valor=v))
    soma = _escalar(sessao_direta,
                    "SELECT SUM(valor) FROM lancamento WHERE conta_id = :c AND valor < 1",
                    c=cenario["minha"])
    assert soma == Decimal("0.30")
    assert str(soma) == "0.30"


def test_decimal_12_2_aceita_o_maior_valor_e_recusa_o_seguinte(cenario, sessao_direta):
    _sql(sessao_direta, "UPDATE conta SET saldo_inicial = 9999999999.99 WHERE id = :i",
         i=cenario["minha"])
    assert _escalar(sessao_direta, "SELECT saldo_inicial FROM conta WHERE id = :i",
                    i=cenario["minha"]) == Decimal("9999999999.99")
    _recusa(sessao_direta, "UPDATE conta SET saldo_inicial = 10000000000.00 WHERE id = :i", 1264,
            i=cenario["minha"])
    _recusa(sessao_direta, "UPDATE conta SET saldo_inicial = -10000000000.00 WHERE id = :i", 1264,
            i=cenario["minha"])


def test_atualizado_em_muda_no_update_que_altera_coluna_e_nao_muda_sem_alteracao(
    cenario, sessao_direta
):
    sel = "SELECT atualizado_em FROM conta WHERE id = :i"
    i = cenario["minha"]
    antes = _escalar(sessao_direta, sel, i=i)
    time.sleep(0.05)
    _sql(sessao_direta, "UPDATE conta SET nome = nome WHERE id = :i", i=i)
    assert _escalar(sessao_direta, sel, i=i) == antes
    _sql(sessao_direta, "UPDATE conta SET nome = 'Outro nome' WHERE id = :i", i=i)
    assert _escalar(sessao_direta, sel, i=i) > antes


def test_sql_mode_estrito_recusa_texto_maior_que_a_coluna(cenario, sessao_direta):
    _recusa(sessao_direta, "UPDATE conta SET nome = :n WHERE id = :i", 1406,
            n="x" * 61, i=cenario["minha"])


# ------------------------------------------------------------------ colunas geradas e unicidade (categoria/tag)

def test_coluna_gerada_escopo_e_preenchida_pelo_banco(cenario, sessao_direta):
    c = cenario["casal"]
    _sql(sessao_direta, "INSERT INTO tag (usuario_id, nome) VALUES (:u, 'a')", u=c.a.id)
    _sql(sessao_direta, "INSERT INTO tag (casal_id, nome) VALUES (:c, 'a')", c=c.id)
    assert _escalar(sessao_direta, "SELECT escopo FROM tag WHERE usuario_id = :u", u=c.a.id) == f"u{c.a.id}"
    assert _escalar(sessao_direta, "SELECT escopo FROM tag WHERE casal_id = :c", c=c.id) == f"c{c.id}"


def test_uq_tag_ignora_caixa_mas_distingue_acento_e_escopo(cenario, sessao_direta):
    c = cenario["casal"]
    _sql(sessao_direta, "INSERT INTO tag (usuario_id, nome) VALUES (:u, 'Saúde')", u=c.a.id)
    _recusa(sessao_direta, "INSERT INTO tag (usuario_id, nome) VALUES (:u, 'SAÚDE')",
            ERR_DUPLICADO, "uq_tag_escopo_nome", u=c.a.id)
    _sql(sessao_direta, "INSERT INTO tag (usuario_id, nome) VALUES (:u, 'Saude')", u=c.a.id)
    _sql(sessao_direta, "INSERT INTO tag (usuario_id, nome) VALUES (:u, 'Saúde')", u=c.b.id)
    _sql(sessao_direta, "INSERT INTO tag (casal_id, nome) VALUES (:c, 'Saúde')", c=c.id)


def test_tag_com_dois_donos_viola_ck_tag_dono(cenario, sessao_direta):
    c = cenario["casal"]
    _recusa(sessao_direta, "INSERT INTO tag (usuario_id, casal_id, nome) VALUES (:u, :c, 'dupla')",
            ERR_CHECK, "ck_tag_dono", u=c.a.id, c=c.id)


def test_tag_sem_dono_e_recusada_pela_coluna_gerada_escopo_not_null(cenario, sessao_direta):
    """Sem dono, `escopo` (gerada, NOT NULL) vira NULL e o MySQL recusa (1048) antes do CHECK."""
    _recusa(sessao_direta, "INSERT INTO tag (nome) VALUES ('orfa')", 1048, "escopo")


_CAT = ("INSERT INTO categoria (usuario_id, categoria_pai_id, tipo, nome, icone, cor, fixa) "
        "VALUES (:u, :pai, :tipo, :nome, 'tag', :cor, :fixa)")


def _cat(u, nome, *, pai=None, tipo="despesa", cor="#112233", fixa=0):
    return {"u": u, "pai": pai, "tipo": tipo, "nome": nome, "cor": cor if pai is None else None,
            "fixa": fixa}


def test_ck_categoria_cor_raiz_exige_cor_e_subcategoria_nao_tem(cenario, sessao_direta):
    u = cenario["casal"].a.id
    _recusa(sessao_direta, _CAT, ERR_CHECK, "ck_categoria_cor", **{**_cat(u, "Sem cor"), "cor": None})
    _sql(sessao_direta, _CAT, **_cat(u, "Raiz nova"))
    pai = _escalar(sessao_direta, "SELECT id FROM categoria WHERE nome = 'Raiz nova' AND usuario_id = :u", u=u)
    _recusa(sessao_direta, _CAT, ERR_CHECK, "ck_categoria_cor",
            **{**_cat(u, "Sub", pai=pai), "cor": "#000000"})
    _sql(sessao_direta, _CAT, **_cat(u, "Sub", pai=pai))
    _recusa(sessao_direta, _CAT, ERR_CHECK, "ck_categoria_fixa", **_cat(u, "Sub fixa", pai=pai, fixa=1))


def test_ck_categoria_tipo_e_dono(cenario, sessao_direta):
    u = cenario["casal"].a.id
    _recusa(sessao_direta, _CAT, ERR_CHECK, "ck_categoria_tipo", **_cat(u, "T", tipo="outro"))
    # sem dono: `escopo` gerada NOT NULL recusa (1048) antes do CHECK
    _recusa(sessao_direta, _CAT, 1048, "escopo", **_cat(None, "Sem dono"))
    # dois donos: aí é o CHECK
    _recusa(sessao_direta, _CAT.replace("(usuario_id,", "(casal_id, usuario_id,").replace(
        "(:u,", "(:c, :u,"), ERR_CHECK, "ck_categoria_dono", c=cenario["casal"].id,
        **_cat(u, "Dois donos"))


def test_uq_categoria_nome_entre_irmas_ignora_caixa_e_respeita_pai_e_escopo(cenario, sessao_direta):
    c = cenario["casal"]
    u = c.a.id
    _sql(sessao_direta, _CAT, **_cat(u, "Lazer X"))
    _recusa(sessao_direta, _CAT, ERR_DUPLICADO, "uq_categoria_escopo_tipo_pai_chave_nome",
            **_cat(u, "LAZER x"))
    # outro tipo, outro escopo (outra pessoa) e acento diferente são aceitos
    _sql(sessao_direta, _CAT, **_cat(u, "Lazer X", tipo="receita"))
    _sql(sessao_direta, _CAT, **_cat(c.b.id, "Lazer X"))
    _sql(sessao_direta, _CAT, **_cat(u, "Lazér X"))
    # mesmo nome em raízes pais diferentes (pai_chave) é aceito
    pai1 = _escalar(sessao_direta, "SELECT id FROM categoria WHERE nome = 'Lazer X' AND tipo = 'despesa' AND usuario_id = :u", u=u)
    _sql(sessao_direta, _CAT, **_cat(u, "Outra raiz"))
    pai2 = _escalar(sessao_direta, "SELECT id FROM categoria WHERE nome = 'Outra raiz' AND usuario_id = :u", u=u)
    _sql(sessao_direta, _CAT, **_cat(u, "Filha", pai=pai1))
    _sql(sessao_direta, _CAT, **_cat(u, "Filha", pai=pai2))
    _recusa(sessao_direta, _CAT, ERR_DUPLICADO, "uq_categoria_escopo_tipo_pai_chave_nome",
            **_cat(u, "filha", pai=pai1))


def test_coluna_gerada_pai_chave_usa_zero_para_raiz(cenario, sessao_direta):
    u = cenario["casal"].a.id
    _sql(sessao_direta, _CAT, **_cat(u, "Raiz Z"))
    pai = _escalar(sessao_direta, "SELECT id FROM categoria WHERE nome = 'Raiz Z' AND usuario_id = :u", u=u)
    _sql(sessao_direta, _CAT, **_cat(u, "Filha Z", pai=pai))
    assert _escalar(sessao_direta, "SELECT pai_chave FROM categoria WHERE id = :i", i=pai) == 0
    assert _escalar(sessao_direta, "SELECT pai_chave FROM categoria WHERE nome = 'Filha Z' AND usuario_id = :u", u=u) == pai


def test_restrict_recusa_apagar_categoria_pai_com_subcategoria(cenario, sessao_direta):
    u = cenario["casal"].a.id
    _sql(sessao_direta, _CAT, **_cat(u, "Raiz P"))
    pai = _escalar(sessao_direta, "SELECT id FROM categoria WHERE nome = 'Raiz P' AND usuario_id = :u", u=u)
    _sql(sessao_direta, _CAT, **_cat(u, "Filha P", pai=pai))
    _recusa(sessao_direta, "DELETE FROM categoria WHERE id = :i", ERR_FK_PAI, i=pai)
