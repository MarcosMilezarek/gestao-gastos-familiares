"""Fatia 1: convites e vínculo do casal pela API e DDL/travas, com banco real."""
import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError


def _convidar(de, para):
    return de.cliente.post("/api/convites", json={"email": para.email})


def _vinculo(pessoa):
    r = pessoa.cliente.get("/api/vinculo")
    assert r.status_code == 200, r.text
    return r.json()


def _estados_convites(sessao_direta) -> list[str]:
    s = sessao_direta()
    return list(s.execute(text("SELECT estado FROM convite ORDER BY id")).scalars())


# ------------------------------------------------------------------ CA-1.06
def test_convidar_pessoa_cadastrada_cria_convite_pendente_visivel_ao_convidante(fab):
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    r = _convidar(a, b)
    assert r.status_code == 201
    assert r.json()["email_convidado"] == b.email
    v = _vinculo(a)
    assert v["estado"] == "convite_enviado"
    assert v["convite_enviado"] == {"id": r.json()["id"], "email_convidado": b.email}


def test_convidar_normaliza_email_com_maiusculas_e_espacos(fab):
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    r = a.cliente.post("/api/convites", json={"email": f"  {b.email.upper()} "})
    assert r.status_code == 201


def test_segundo_convite_com_um_pendente_e_recusado(fab):
    a, b, c = fab.uma_pessoa(), fab.uma_pessoa(), fab.uma_pessoa()
    assert _convidar(a, b).status_code == 201
    r = _convidar(a, c)
    assert r.status_code == 409
    assert r.json()["erro"]["codigo"] == "CONVITE_PENDENTE_EXISTE"


def test_cancelar_encerra_convite_e_libera_novo_convite(fab, sessao_direta):
    a, b, c = fab.uma_pessoa(), fab.uma_pessoa(), fab.uma_pessoa()
    convite_id = _convidar(a, b).json()["id"]
    assert a.cliente.delete(f"/api/convites/{convite_id}").status_code == 204
    assert _estados_convites(sessao_direta) == ["cancelado"]
    assert _vinculo(a)["estado"] == "sem_vinculo"
    assert _vinculo(b)["convites_recebidos"] == []
    assert _convidar(a, c).status_code == 201


def test_cancelar_convite_ja_cancelado_da_conflito(fab):
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    convite_id = _convidar(a, b).json()["id"]
    a.cliente.delete(f"/api/convites/{convite_id}")
    r = a.cliente.delete(f"/api/convites/{convite_id}")
    assert r.status_code == 409
    assert r.json()["erro"]["codigo"] == "CONVITE_NAO_PENDENTE"


def test_so_o_convidante_cancela_convite(fab):
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    convite_id = _convidar(a, b).json()["id"]
    r = b.cliente.delete(f"/api/convites/{convite_id}")
    assert r.status_code == 404
    assert _vinculo(a)["estado"] == "convite_enviado"


def test_convite_nao_envia_email(fab, monkeypatch):
    import smtplib

    def proibido(*args, **kwargs):
        raise AssertionError("o sistema não deve enviar e-mail")

    monkeypatch.setattr(smtplib.SMTP, "__init__", proibido)
    monkeypatch.setattr(smtplib.SMTP_SSL, "__init__", proibido)
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    cid = _convidar(a, b).json()["id"]
    a.cliente.delete(f"/api/convites/{cid}")


# ------------------------------------------------------------------ CA-1.07
def test_convidar_email_nao_cadastrado_e_recusado_com_motivo(fab):
    a = fab.uma_pessoa()
    r = a.cliente.post("/api/convites", json={"email": "ninguem@example.com"})
    assert r.status_code == 409
    assert r.json()["erro"]["codigo"] == "CONVIDADO_NAO_CADASTRADO"
    assert r.json()["erro"]["mensagem"]


def test_convidar_o_proprio_email_e_recusado(fab):
    a = fab.uma_pessoa()
    r = a.cliente.post("/api/convites", json={"email": a.email})
    assert r.status_code == 409
    assert r.json()["erro"]["codigo"] == "CONVITE_PARA_SI_MESMO"


def test_convidar_pessoa_ja_vinculada_e_recusado(fab):
    casal = fab.um_casal()
    c = fab.uma_pessoa()
    r = _convidar(c, casal.a)
    assert r.status_code == 409
    assert r.json()["erro"]["codigo"] == "CONVIDADO_JA_VINCULADO"
    assert _vinculo(c)["estado"] == "sem_vinculo"


def test_convidar_com_email_invalido_da_422_no_campo_email(fab):
    a = fab.uma_pessoa()
    r = a.cliente.post("/api/convites", json={"email": "nao-e-email"})
    assert r.status_code == 422
    assert r.json()["erro"]["codigo"] == "VALIDACAO"
    assert "email" in r.json()["erro"]["campos"]


# ------------------------------------------------------------------ CA-1.08
def test_convidado_ve_convite_com_nome_de_quem_convidou(fab):
    a, b = fab.uma_pessoa("Ana Convidante"), fab.uma_pessoa()
    convite_id = _convidar(a, b).json()["id"]
    v = _vinculo(b)
    assert v["estado"] == "convite_recebido"
    assert v["convites_recebidos"] == [{"id": convite_id, "convidante_nome": "Ana Convidante"}]


def test_aceitar_vincula_as_duas_e_cada_uma_ve_o_nome_da_outra(fab):
    a, b = fab.uma_pessoa("Ana"), fab.uma_pessoa("Beto")
    convite_id = _convidar(a, b).json()["id"]
    r = b.cliente.post(f"/api/convites/{convite_id}/aceitar")
    assert r.status_code == 200
    assert r.json()["estado"] == "vinculado"
    assert r.json()["parceiro"]["nome"] == "Ana"
    va, vb = _vinculo(a), _vinculo(b)
    assert va["estado"] == "vinculado"
    assert va["parceiro"] == {"id": b.id, "nome": "Beto"}
    assert vb["estado"] == "vinculado"
    assert vb["parceiro"] == {"id": a.id, "nome": "Ana"}


def test_aceitar_grava_casal_com_a_quem_convidou(fab, sessao_direta):
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    convite_id = _convidar(a, b).json()["id"]
    b.cliente.post(f"/api/convites/{convite_id}/aceitar")
    s = sessao_direta()
    linha = s.execute(
        text("SELECT pessoa_a_id, pessoa_b_id, encerrado_em FROM casal")
    ).all()
    assert len(linha) == 1
    assert (linha[0].pessoa_a_id, linha[0].pessoa_b_id) == (a.id, b.id)
    assert linha[0].encerrado_em is None


def test_recusar_nao_cria_vinculo_e_convite_some(fab, sessao_direta):
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    convite_id = _convidar(a, b).json()["id"]
    r = b.cliente.post(f"/api/convites/{convite_id}/recusar")
    assert r.status_code == 200
    assert r.json()["estado"] == "sem_vinculo"
    assert r.json()["convites_recebidos"] == []
    assert _vinculo(b)["estado"] == "sem_vinculo"
    assert _vinculo(a)["estado"] == "sem_vinculo"
    assert _estados_convites(sessao_direta) == ["recusado"]
    n = sessao_direta().execute(text("SELECT COUNT(*) FROM casal")).scalar_one()
    assert n == 0


def test_so_o_convidado_aceita_ou_recusa(fab):
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    convite_id = _convidar(a, b).json()["id"]
    assert a.cliente.post(f"/api/convites/{convite_id}/aceitar").status_code == 404
    assert a.cliente.post(f"/api/convites/{convite_id}/recusar").status_code == 404
    terceira = fab.uma_pessoa()
    assert terceira.cliente.post(f"/api/convites/{convite_id}/aceitar").status_code == 404


def test_aceitar_convite_inexistente_da_404(fab):
    b = fab.uma_pessoa()
    assert b.cliente.post("/api/convites/999999/aceitar").status_code == 404


def test_aceitar_convite_ja_recusado_da_conflito(fab):
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    convite_id = _convidar(a, b).json()["id"]
    b.cliente.post(f"/api/convites/{convite_id}/recusar")
    r = b.cliente.post(f"/api/convites/{convite_id}/aceitar")
    assert r.status_code == 409
    assert r.json()["erro"]["codigo"] == "CONVITE_NAO_PENDENTE"


# ------------------------------------------------------------------ CA-1.09
def test_pessoa_vinculada_nao_envia_convite(fab):
    casal = fab.um_casal()
    c = fab.uma_pessoa()
    r = _convidar(casal.a, c)
    assert r.status_code == 409
    assert r.json()["erro"]["codigo"] == "JA_VINCULADO"


def test_pessoa_vinculada_nao_aceita_convite_pendente_anterior(fab, sessao_direta):
    """B recebe convite de C, depois se vincula a A: o convite de C fica inválido."""
    a, b, c = fab.uma_pessoa(), fab.uma_pessoa(), fab.uma_pessoa()
    convite_de_c = _convidar(c, b).json()["id"]
    convite_de_a = _convidar(a, b).json()["id"]
    assert b.cliente.post(f"/api/convites/{convite_de_a}/aceitar").status_code == 200
    r = b.cliente.post(f"/api/convites/{convite_de_c}/aceitar")
    assert r.status_code == 409
    assert r.json()["erro"]["codigo"] == "CONVITE_NAO_PENDENTE"
    assert _estados_convites(sessao_direta) == ["invalidado", "aceito"]
    assert _vinculo(c)["estado"] == "sem_vinculo"


def test_aceite_invalida_convites_pendentes_em_que_as_duas_sao_convidante_ou_convidado(
    fab, sessao_direta
):
    a, b, c, d = (fab.uma_pessoa() for _ in range(4))
    para_a = _convidar(c, a).json()["id"]  # c -> a (a vai se vincular)
    enviado_por_b = _convidar(b, d).json()["id"]  # b -> d (b vai se vincular)
    aceito = _convidar(a, b).json()["id"]
    assert b.cliente.post(f"/api/convites/{aceito}/aceitar").status_code == 200
    estados = dict(
        sessao_direta().execute(text("SELECT id, estado FROM convite")).all()
    )
    assert estados[aceito] == "aceito"
    assert estados[para_a] == "invalidado"
    assert estados[enviado_por_b] == "invalidado"
    assert _vinculo(d)["convites_recebidos"] == []
    assert _vinculo(c)["estado"] == "sem_vinculo"


def test_aceite_com_convidante_que_se_vinculou_a_outra_pessoa_e_recusado(fab, sessao_direta):
    """Convite pendente cujo convidante ganhou casal por outro caminho não vale mais."""
    a, b, c = fab.uma_pessoa(), fab.uma_pessoa(), fab.uma_pessoa()
    convite = _convidar(a, b).json()["id"]
    # a aceita um convite de c: o convite de a para b é invalidado
    de_c = _convidar(c, a).json()["id"]
    assert a.cliente.post(f"/api/convites/{de_c}/aceitar").status_code == 200
    r = b.cliente.post(f"/api/convites/{convite}/aceitar")
    assert r.status_code == 409
    assert r.json()["erro"]["codigo"] == "CONVITE_NAO_PENDENTE"
    assert _vinculo(b)["estado"] == "sem_vinculo"


def test_aceite_recusa_convite_pendente_quando_convidante_tem_casal_sem_invalidacao(
    fab, sessao_direta
):
    """Defesa do serviço: pendente remanescente com convidante já vinculado dá CONVIDADO_JA_VINCULADO."""
    a, b, c = fab.uma_pessoa(), fab.uma_pessoa(), fab.uma_pessoa()
    convite = _convidar(a, b).json()["id"]
    s = sessao_direta()
    s.execute(
        text(
            "INSERT INTO casal (pessoa_a_id, pessoa_b_id, criado_em) "
            "VALUES (:a, :c, UTC_TIMESTAMP(6))"
        ),
        {"a": a.id, "c": c.id},
    )
    s.commit()
    r = b.cliente.post(f"/api/convites/{convite}/aceitar")
    assert r.status_code == 409
    assert r.json()["erro"]["codigo"] == "CONVIDADO_JA_VINCULADO"
    assert _vinculo(b)["parceiro"] is None


def test_aceite_recusa_quando_convidado_ja_tem_casal(fab, sessao_direta):
    a, b, c = fab.uma_pessoa(), fab.uma_pessoa(), fab.uma_pessoa()
    convite = _convidar(a, b).json()["id"]
    s = sessao_direta()
    s.execute(
        text(
            "INSERT INTO casal (pessoa_a_id, pessoa_b_id, criado_em) "
            "VALUES (:c, :b, UTC_TIMESTAMP(6))"
        ),
        {"b": b.id, "c": c.id},
    )
    s.commit()
    r = b.cliente.post(f"/api/convites/{convite}/aceitar")
    assert r.status_code == 409
    assert r.json()["erro"]["codigo"] == "JA_VINCULADO"


# ------------------------------------------------------------------ CA-1.15
def test_estado_sem_vinculo(fab):
    v = _vinculo(fab.uma_pessoa())
    assert v == {
        "estado": "sem_vinculo",
        "convite_enviado": None,
        "convites_recebidos": [],
        "parceiro": None,
    }


def test_estado_convite_enviado(fab):
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    convite_id = _convidar(a, b).json()["id"]
    assert _vinculo(a) == {
        "estado": "convite_enviado",
        "convite_enviado": {"id": convite_id, "email_convidado": b.email},
        "convites_recebidos": [],
        "parceiro": None,
    }


def test_estado_convite_recebido(fab):
    a, b = fab.uma_pessoa("Ana"), fab.uma_pessoa()
    convite_id = _convidar(a, b).json()["id"]
    assert _vinculo(b) == {
        "estado": "convite_recebido",
        "convite_enviado": None,
        "convites_recebidos": [{"id": convite_id, "convidante_nome": "Ana"}],
        "parceiro": None,
    }


def test_estado_vinculado_sem_acoes_de_convite(fab):
    casal = fab.um_casal("Ana", "Beto")
    assert _vinculo(casal.a) == {
        "estado": "vinculado",
        "convite_enviado": None,
        "convites_recebidos": [],
        "parceiro": {"id": casal.b.id, "nome": "Beto"},
    }
    assert _vinculo(casal.b)["parceiro"] == {"id": casal.a.id, "nome": "Ana"}


def test_convite_recebido_tem_precedencia_sobre_enviado_e_ambos_vem_preenchidos(fab):
    a, b, c = fab.uma_pessoa(), fab.uma_pessoa("Beto"), fab.uma_pessoa()
    enviado = _convidar(a, b).json()["id"]
    recebido = _convidar(c, a).json()["id"]
    v = _vinculo(a)
    assert v["estado"] == "convite_recebido"
    assert v["convite_enviado"]["id"] == enviado
    assert [r["id"] for r in v["convites_recebidos"]] == [recebido]


def test_vinculo_exige_login(fab):
    r = fab.cliente().get("/api/vinculo")
    assert r.status_code == 401


# ------------------------------------------------------------------ DDL e travas
def test_indice_unico_de_convite_pendente_por_convidante_traz_nome_da_chave_no_erro(
    fab, sessao_direta
):
    a, b, c = fab.uma_pessoa(), fab.uma_pessoa(), fab.uma_pessoa()
    s = sessao_direta()
    sql = text(
        "INSERT INTO convite (convidante_id, convidado_id, estado, criado_em) "
        "VALUES (:a, :x, 'pendente', UTC_TIMESTAMP(6))"
    )
    s.execute(sql, {"a": a.id, "x": b.id})
    s.commit()
    with pytest.raises(IntegrityError) as exc:
        s.execute(sql, {"a": a.id, "x": c.id})
    s.rollback()
    assert exc.value.orig.args[0] == 1062
    assert "uq_convite_pendente_chave" in str(exc.value.orig)


def test_indice_unico_nao_colide_com_convites_nao_pendentes(fab, sessao_direta):
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    s = sessao_direta()
    for estado in ("cancelado", "recusado", "invalidado", "pendente"):
        s.execute(
            text(
                "INSERT INTO convite (convidante_id, convidado_id, estado, criado_em) "
                "VALUES (:a, :b, :e, UTC_TIMESTAMP(6))"
            ),
            {"a": a.id, "b": b.id, "e": estado},
        )
    s.commit()
    assert len(_estados_convites(sessao_direta)) == 4


def test_servico_traduz_integrity_error_da_chave_em_convite_pendente_existe(
    fab, sessao_direta, monkeypatch
):
    """Se a checagem prévia perder a corrida, o IntegrityError vira 409 CONVITE_PENDENTE_EXISTE."""
    from app.acesso import contexto_do_usuario
    from app.errors import AppError
    from app.services import vinculo

    a, b, c = fab.uma_pessoa(), fab.uma_pessoa(), fab.uma_pessoa()
    assert _convidar(a, b).status_code == 201
    s = sessao_direta()
    ctx = contexto_do_usuario(s, a.id)
    # Cega a checagem prévia (só a de convite pendente) para forçar o caminho do índice.
    original = s.scalar

    def scalar(stmt, *args, **kwargs):
        if "FROM convite" in str(stmt):  # só a checagem prévia de convite pendente
            return None
        return original(stmt, *args, **kwargs)

    monkeypatch.setattr(s, "scalar", scalar)
    with pytest.raises(AppError) as exc:
        vinculo.convidar(s, ctx, c.email)
    assert exc.value.codigo == "CONVITE_PENDENTE_EXISTE"
    assert exc.value.status == 409


def test_sessao_da_aplicacao_usa_read_committed(banco):
    from app.db import get_engine

    with get_engine().connect() as con:
        nivel = con.execute(text("SELECT @@transaction_isolation")).scalar_one()
    assert nivel == "READ-COMMITTED"


def test_sessao_direta_dos_testes_tambem_e_read_committed(sessao_direta):
    nivel = sessao_direta().execute(text("SELECT @@transaction_isolation")).scalar_one()
    assert nivel == "READ-COMMITTED"


def test_explain_do_update_do_aceite_com_convite_cruzado_usa_indice(fab, sessao_direta):
    """A convida B e B convida A: o UPDATE em massa do aceite precisa ter índice utilizável."""
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    assert _convidar(a, b).status_code == 201
    assert _convidar(b, a).status_code == 201
    s = sessao_direta()
    plano = s.execute(
        text(
            "EXPLAIN UPDATE convite SET estado = 'invalidado' "
            "WHERE estado = 'pendente' "
            "AND (convidante_id IN (:a, :b) OR convidado_id IN (:a, :b))"
        ),
        {"a": a.id, "b": b.id},
    ).mappings().all()
    s.rollback()
    assert plano, "EXPLAIN não devolveu linhas"
    linha = plano[0]
    assert linha["table"] == "convite"
    assert linha["possible_keys"], f"nenhum índice utilizável: {dict(linha)}"
    # Com a tabela minúscula o otimizador pode preferir varredura; o que importa é que
    # existam índices para convidante_id e convidado_id para o plano escalar.
    possiveis = linha["possible_keys"]
    assert "ix_convite_convidado_id_estado" in possiveis or "fk_convite_convidado_id_usuario" in possiveis
    assert "uq_convite_pendente_chave" in possiveis or "fk_convite_convidante_id_usuario" in possiveis


def test_update_do_aceite_cruzado_invalida_os_dois_pendentes(fab, sessao_direta):
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    ida = _convidar(a, b).json()["id"]
    _convidar(b, a)
    r = b.cliente.post(f"/api/convites/{ida}/aceitar")
    assert r.status_code == 200
    assert _estados_convites(sessao_direta) == ["aceito", "invalidado"]
