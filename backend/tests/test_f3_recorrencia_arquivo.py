"""Fatia 3: recorrência e conta arquivada (CA-3.08, D-037), corridas da geração (t121r: S3, S4)."""
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date

from sqlalchemy import event, text

from app.acesso import contexto_do_usuario
from app.services import contas as servico_contas
from app.services import recorrencias

PRAZO = 30


def _categoria(cliente, nome: str, tipo: str = "despesa") -> int:
    r = cliente.get("/api/categorias", params={"tipo": tipo})
    assert r.status_code == 200, r.text
    for raiz in r.json():
        for no in [raiz, *raiz["subcategorias"]]:
            if no["nome"] == nome:
                return no["id"]
    raise AssertionError(f"categoria {nome!r} não encontrada")


def _conta_do(cliente, dono_id) -> int:
    contas = cliente.get("/api/contas").json()["contas"]
    return next(c["id"] for c in contas if c["dono_usuario_id"] == dono_id)


def _serie(fab, relogio, hoje=date(2026, 3, 15), data="2026-03-10", **extra):
    """Pessoa com despesa recorrente sem fim de R$ 1.500,00; devolve (pessoa, conta, recorrencia_id)."""
    relogio(hoje)
    p = fab.uma_pessoa()
    conta = _conta_do(p.cliente, p.id)
    corpo = {
        "tipo": "despesa", "valor": "1500.00", "data": data, "descricao": "Aluguel",
        "categoria_id": _categoria(p.cliente, "Mercado"),
        "dono_usuario_id": p.id, "conta_id": conta, "recorrencia": {"modo": "sem_fim"},
    }
    corpo.update(extra)
    r = p.cliente.post("/api/lancamentos", json=corpo)
    assert r.status_code == 201, r.text
    return p, conta, r.json()["recorrencia_id"]


def _doc(cliente, mes, rid) -> list[dict]:
    r = cliente.get("/api/lancamentos", params={"mes": mes})
    assert r.status_code == 200, r.text
    return sorted(
        (x for x in r.json() if x["recorrencia_id"] == rid), key=lambda x: x["numero_recorrencia"]
    )


def _numeros(cliente, ate_mes, rid) -> dict[int, dict]:
    """Todas as ocorrências visíveis até `ate_mes` (gera sob demanda), por número."""
    r = cliente.get("/api/lancamentos", params={"mes": ate_mes})
    assert r.status_code == 200, r.text
    todos = {}
    ano, mes = 2025, 1
    while (ano, mes) <= tuple(int(x) for x in ate_mes.split("-")):
        for x in _doc(cliente, f"{ano}-{mes:02d}", rid):
            todos[x["numero_recorrencia"]] = x
        ano, mes = (ano + 1, 1) if mes == 12 else (ano, mes + 1)
    return todos


def _arquivar(cliente, conta):
    r = cliente.post(f"/api/contas/{conta}/arquivar")
    assert r.status_code == 200, r.text


def _desarquivar(cliente, conta):
    r = cliente.post(f"/api/contas/{conta}/desarquivar")
    assert r.status_code == 200, r.text


# ------------------------------------------------------------------ CA-3.08

def test_arquivar_a_conta_esconde_as_ocorrencias_seguintes_e_mantem_as_confirmadas(fab, relogio):
    p, conta, rid = _serie(fab, relogio)
    antes = _numeros(p.cliente, "2026-06", rid)
    assert sorted(antes) == [1, 2, 3, 4]
    r = p.cliente.post(f"/api/lancamentos/{antes[1]['id']}/confirmar", json={})
    assert r.status_code == 200, r.text

    _arquivar(p.cliente, conta)

    depois = _numeros(p.cliente, "2026-06", rid)
    assert {n: x["situacao"] for n, x in depois.items()} == {1: "confirmada"}
    for mes in ("2026-04", "2026-05", "2026-06"):
        assert _doc(p.cliente, mes, rid) == []


def test_desarquivar_a_conta_faz_as_ocorrencias_voltarem(fab, relogio):
    p, conta, rid = _serie(fab, relogio)
    _numeros(p.cliente, "2026-06", rid)
    _arquivar(p.cliente, conta)
    _desarquivar(p.cliente, conta)

    de_volta = _numeros(p.cliente, "2026-06", rid)
    assert sorted(de_volta) == [1, 2, 3, 4]
    assert all(x["valor"] == "1500.00" for x in de_volta.values())


def test_conta_arquivada_nao_gera_ocorrencias_ao_navegar_para_meses_futuros(fab, relogio):
    p, conta, rid = _serie(fab, relogio)
    _arquivar(p.cliente, conta)
    assert _doc(p.cliente, "2026-09", rid) == []
    assert _doc(p.cliente, "2027-03", rid) == []


# ------------------------------------------------------------------ D-037

def test_ocorrencia_futura_excluida_somente_esta_volta_ao_desarquivar(fab, relogio):
    p, conta, rid = _serie(fab, relogio)
    oc = _numeros(p.cliente, "2026-06", rid)
    r = p.cliente.delete(f"/api/lancamentos/{oc[3]['id']}", params={"alcance": "somente_este"})
    assert r.status_code == 204, r.text
    assert 3 not in _numeros(p.cliente, "2026-06", rid)

    _arquivar(p.cliente, conta)
    _desarquivar(p.cliente, conta)

    volta = _numeros(p.cliente, "2026-06", rid)
    assert sorted(volta) == [1, 2, 3, 4]
    assert (volta[3]["situacao"], volta[3]["valor"]) == ("prevista", "1500.00")


def test_ocorrencia_futura_ajustada_somente_esta_volta_como_o_modelo(fab, relogio):
    p, conta, rid = _serie(fab, relogio)
    oc = _numeros(p.cliente, "2026-06", rid)
    r = p.cliente.patch(
        f"/api/lancamentos/{oc[3]['id']}", params={"alcance": "somente_este"},
        json={"valor": "999.00"},
    )
    assert r.status_code == 200, r.text

    _arquivar(p.cliente, conta)
    _desarquivar(p.cliente, conta)

    assert _numeros(p.cliente, "2026-06", rid)[3]["valor"] == "1500.00"


def test_confirmadas_ficam_como_estao_ao_arquivar_e_desarquivar(fab, relogio):
    p, conta, rid = _serie(fab, relogio)
    oc = _numeros(p.cliente, "2026-06", rid)
    r = p.cliente.post(f"/api/lancamentos/{oc[2]['id']}/confirmar", json={"valor": "1620.00"})
    assert r.status_code == 200, r.text

    _arquivar(p.cliente, conta)
    _desarquivar(p.cliente, conta)

    volta = _numeros(p.cliente, "2026-06", rid)
    assert (volta[2]["situacao"], volta[2]["valor"], volta[2]["id"]) == (
        "confirmada", "1620.00", oc[2]["id"],
    )
    assert sorted(volta) == [1, 2, 3, 4]


# ------------------------------------------------- t121r: duas sessões, S3, S4

def _correr(sessao_direta, tarefas):
    barreira = threading.Barrier(len(tarefas), timeout=PRAZO)
    sessoes = [sessao_direta() for _ in tarefas]

    def executar(tarefa, db):
        try:
            barreira.wait()
            return ("ok", tarefa(db))
        except Exception as e:  # noqa: BLE001 - o teste inspeciona qualquer falha
            db.rollback()
            return ("erro", e)

    with ThreadPoolExecutor(max_workers=len(tarefas)) as pool:
        futuros = [pool.submit(executar, t, s) for t, s in zip(tarefas, sessoes, strict=True)]
        return [f.result(timeout=PRAZO) for f in futuros]


def _gerar(pessoa_id, ate):
    def tarefa(db):
        recorrencias.garantir_ate(db, contexto_do_usuario(db, pessoa_id), ate)

    return tarefa


def _linhas(sessao_direta, sql, **params):
    s = sessao_direta()
    try:
        return s.execute(text(sql), params).all()
    finally:
        s.rollback()


def test_duas_sessoes_garantir_ate_ao_mesmo_tempo_nao_duplicam_ocorrencia(
    fab, relogio, sessao_direta
):
    p, _, rid = _serie(fab, relogio)
    resultados = _correr(
        sessao_direta, [_gerar(p.id, date(2026, 12, 31)), _gerar(p.id, date(2026, 12, 31))]
    )
    assert [r[0] for r in resultados] == ["ok", "ok"], resultados
    numeros = [
        n for (n,) in _linhas(
            sessao_direta,
            "SELECT numero_recorrencia FROM lancamento WHERE recorrencia_id = :r "
            "ORDER BY numero_recorrencia", r=rid,
        )
    ]
    assert numeros == list(range(1, 11))
    (gerado,) = _linhas(sessao_direta, "SELECT gerado_ate FROM recorrencia WHERE id = :r", r=rid)[0]
    assert gerado == 10


def test_arquivar_e_gerar_ao_mesmo_tempo_nao_deixam_prevista_futura_em_conta_arquivada(
    fab, relogio, sessao_direta
):
    """S3 da t121r: a geração não pode recriar previstas futuras numa conta já arquivada."""
    p, conta, _ = _serie(fab, relogio)
    relogio(date(2026, 3, 15))
    problemas = []
    for _ in range(6):
        def arquivar(db, conta=conta):
            servico_contas.arquivar(db, contexto_do_usuario(db, p.id), conta)

        resultados = _correr(sessao_direta, [_gerar(p.id, date(2026, 12, 31)), arquivar])
        assert [r[0] for r in resultados] == ["ok", "ok"], resultados
        sobra = _linhas(
            sessao_direta,
            "SELECT COUNT(*) FROM lancamento WHERE conta_id = :c AND situacao = 'prevista' "
            "AND data >= '2026-03-15'", c=conta,
        )[0][0]
        if sobra:
            problemas.append(sobra)
        _desarquivar(p.cliente, conta)
    assert problemas == [], f"previstas futuras sobraram em conta arquivada: {problemas}"


def test_consulta_das_candidatas_da_geracao_tem_order_by(fab, relogio, sessao_direta):
    """S4 da t121r: ordem determinística das travas FOR UPDATE evita impasse entre leituras."""
    p, _, _ = _serie(fab, relogio)
    db = sessao_direta()
    capturadas: list[str] = []

    @event.listens_for(db.get_bind(), "before_cursor_execute")
    def _capturar(conn, cursor, statement, parameters, context, executemany):
        capturadas.append(statement)

    recorrencias.garantir_ate(db, contexto_do_usuario(db, p.id), date(2026, 12, 31))
    candidatas = [
        s for s in capturadas
        if "FROM recorrencia" in s and "gerado_ate <" in s and "FOR UPDATE" not in s
    ]
    assert candidatas, capturadas
    assert all("ORDER BY" in s for s in candidatas), candidatas
