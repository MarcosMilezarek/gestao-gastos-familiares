"""Fatia 2: reajuste de saldo (CA-2.04), corrida de reajustes (D-032) e achados de t98 (I1, I4, S3)."""
import threading
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as TempoEsgotado
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import text

from app.acesso import contexto_do_usuario
from app.services import contas as contas_service

HOJE = date(2026, 3, 15)
PRAZO = 30  # segundos
REPETICOES = 6


def _contas(cliente, **params):
    r = cliente.get("/api/contas", params=params)
    assert r.status_code == 200, r.text
    return r.json()["contas"]


def _categoria(cliente, nome: str, tipo: str = "despesa") -> int:
    r = cliente.get("/api/categorias", params={"tipo": tipo})
    assert r.status_code == 200, r.text
    for raiz in r.json():
        for no in [raiz, *raiz["subcategorias"]]:
            if no["nome"] == nome:
                return no["id"]
    raise AssertionError(f"categoria {nome!r} não encontrada")


def _lancar(cliente, conta_id, valor, *, tipo="despesa", data="2026-03-10", situacao=None):
    dono = cliente.get(f"/api/contas/{conta_id}").json()["dono_usuario_id"]
    corpo = {
        "tipo": tipo, "valor": valor, "data": data, "descricao": "teste",
        "categoria_id": _categoria(cliente, "Mercado" if tipo == "despesa" else "Salário", tipo),
        "dono_usuario_id": dono, "conta_id": conta_id,
    }
    if situacao:
        corpo["situacao"] = situacao
    r = cliente.post("/api/lancamentos", json=corpo)
    assert r.status_code == 201, r.text
    return r.json()


def _reajustar(cliente, conta_id, saldo_real):
    return cliente.post(f"/api/contas/{conta_id}/reajuste", json={"saldo_real": saldo_real})


def _saldo(cliente, conta_id) -> str:
    return cliente.get(f"/api/contas/{conta_id}").json()["saldo_atual"]


@pytest.fixture
def conta_850(fab, relogio):
    """Pessoa com conta de saldo atual R$ 850,00 (inicial 1000, despesa confirmada de 150)."""
    relogio(HOJE)
    p = fab.uma_pessoa()
    conta = _contas(p.cliente)[0]
    p.cliente.patch(f"/api/contas/{conta['id']}", json={"saldo_inicial": "1000.00"})
    _lancar(p.cliente, conta["id"], "150.00", situacao="confirmada")
    assert _saldo(p.cliente, conta["id"]) == "850.00"
    return p, conta["id"]


# ------------------------------------------------------------------ CA-2.04

def test_reajuste_para_cima_cria_ajuste_confirmado_de_mais_50(conta_850):
    p, conta_id = conta_850
    r = _reajustar(p.cliente, conta_id, "900.00")
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert corpo["conta"]["saldo_atual"] == "900.00"
    lanc = corpo["lancamento"]
    assert (lanc["tipo"], lanc["valor"], lanc["situacao"]) == ("reajuste", "50.00", "confirmada")
    assert lanc["data"] == "2026-03-15"
    assert lanc["conta_id"] == conta_id
    assert lanc["criado_por"]["id"] == p.id
    assert _saldo(p.cliente, conta_id) == "900.00"


def test_reajuste_nao_entra_como_entrada_no_balanco_do_mes(conta_850):
    p, conta_id = conta_850
    antes = p.cliente.get("/api/balanco", params={"mes": "2026-03"}).json()
    assert _reajustar(p.cliente, conta_id, "900.00").status_code == 200
    depois = p.cliente.get("/api/balanco", params={"mes": "2026-03"}).json()
    assert depois["total"]["entradas"] == antes["total"]["entradas"]
    assert depois["total"]["saidas"] == antes["total"]["saidas"]
    conta = next(c for c in depois["contas"] if c["conta_id"] == conta_id)
    assert conta["entradas"]["realizado"] == "0.00"
    assert conta["saldo_atual"] == "900.00"


def test_reajuste_para_o_mesmo_saldo_nao_cria_lancamento(conta_850):
    p, conta_id = conta_850
    r = _reajustar(p.cliente, conta_id, "850.00")
    assert r.status_code == 200
    assert r.json()["lancamento"] is None
    assert r.json()["conta"]["saldo_atual"] == "850.00"
    lista = p.cliente.get("/api/lancamentos", params={"mes": "2026-03", "conta_id": conta_id}).json()
    assert [x["tipo"] for x in lista] == ["despesa"]


@pytest.mark.parametrize(
    ("saldo_real", "diferenca"),
    [("800.00", "-50.00"), ("0.00", "-850.00"), ("-10.50", "-860.50"), ("850.01", "0.01")],
)
def test_reajuste_para_baixo_zero_negativo_e_centavo_tem_diferenca_com_sinal(
    conta_850, saldo_real, diferenca
):
    p, conta_id = conta_850
    r = _reajustar(p.cliente, conta_id, saldo_real)
    assert r.status_code == 200, r.text
    assert r.json()["lancamento"]["valor"] == diferenca
    assert r.json()["conta"]["saldo_atual"] == saldo_real


def test_reajuste_considera_so_lancamentos_confirmados_e_nao_mexe_no_previsto(conta_850):
    p, conta_id = conta_850
    _lancar(p.cliente, conta_id, "50.00", data="2026-03-20", situacao="prevista")
    r = _reajustar(p.cliente, conta_id, "900.00")
    assert r.json()["lancamento"]["valor"] == "50.00"
    assert r.json()["conta"]["saldo_atual"] == "900.00"
    assert r.json()["conta"]["saldo_previsto"] == "850.00"


def test_reajuste_nao_e_editavel_mas_pode_ser_excluido(conta_850):
    p, conta_id = conta_850
    lid = _reajustar(p.cliente, conta_id, "900.00").json()["lancamento"]["id"]
    r = p.cliente.patch(f"/api/lancamentos/{lid}", json={"valor": "1.00"})
    assert (r.status_code, r.json()["erro"]["codigo"]) == (409, "LANCAMENTO_NAO_EDITAVEL")
    assert p.cliente.delete(f"/api/lancamentos/{lid}").status_code == 204
    assert _saldo(p.cliente, conta_id) == "850.00"


def test_reajuste_nao_e_aceito_na_criacao_de_lancamento(conta_850):
    p, conta_id = conta_850
    r = p.cliente.post(
        "/api/lancamentos",
        json={"tipo": "reajuste", "valor": "10.00", "data": "2026-03-10", "conta_id": conta_id},
    )
    assert r.status_code == 422


@pytest.mark.parametrize("saldo_real", ["abc", "1,5", "1.234", "10000000000.00", "-10000000000.00", None])
def test_reajuste_com_saldo_real_invalido_responde_422(conta_850, saldo_real):
    p, conta_id = conta_850
    assert _reajustar(p.cliente, conta_id, saldo_real).status_code == 422
    assert _saldo(p.cliente, conta_id) == "850.00"


def test_reajuste_em_conta_arquivada_responde_409_e_nao_cria_lancamento(conta_850):
    p, conta_id = conta_850
    p.cliente.post(f"/api/contas/{conta_id}/arquivar")
    r = _reajustar(p.cliente, conta_id, "900.00")
    assert (r.status_code, r.json()["erro"]["codigo"]) == (409, "CONTA_ARQUIVADA")
    assert _saldo(p.cliente, conta_id) == "850.00"


def test_patch_em_conta_arquivada_responde_409_e_nao_altera_a_conta(conta_850):
    p, conta_id = conta_850
    p.cliente.post(f"/api/contas/{conta_id}/arquivar")
    r = p.cliente.patch(f"/api/contas/{conta_id}", json={"saldo_inicial": "5.00", "nome": "Z"})
    assert (r.status_code, r.json()["erro"]["codigo"]) == (409, "CONTA_ARQUIVADA")
    conta = p.cliente.get(f"/api/contas/{conta_id}").json()
    assert (conta["saldo_inicial"], conta["nome"]) == ("1000.00", "Conta de " + p.nome)


def test_reajuste_em_conta_de_outro_casal_responde_404(fab):
    c1, c2 = fab.dois_casais()
    alheia = _contas(c2.a.cliente)[0]["id"]
    assert _reajustar(c1.a.cliente, alheia, "1.00").status_code == 404


# ------------------------------------------------------------------ S3 (t98): limite do DECIMAL(12,2)

def test_reajuste_cuja_diferenca_passa_do_limite_do_banco_nao_vira_erro_interno(fab, relogio):
    """Saldo atual -9.999.999.999,99 reajustado para +9.999.999.999,99: diferença de 19.999.999.999,98
    não cabe em lancamento.valor (DECIMAL(12,2)). Esperado: 422 com campos.saldo_real e conta intacta."""
    relogio(HOJE)
    p = fab.uma_pessoa()
    conta_id = _contas(p.cliente)[0]["id"]
    r = p.cliente.patch(f"/api/contas/{conta_id}", json={"saldo_inicial": "-9999999999.99"})
    assert r.status_code == 200, r.text
    r = _reajustar(p.cliente, conta_id, "9999999999.99")
    assert r.status_code == 422, r.text
    assert "saldo_real" in r.json()["erro"]["campos"]
    assert _saldo(p.cliente, conta_id) == "-9999999999.99"


def test_reajuste_na_borda_maxima_que_cabe_no_banco_e_aceito(fab, relogio):
    relogio(HOJE)
    p = fab.uma_pessoa()
    conta_id = _contas(p.cliente)[0]["id"]
    r = _reajustar(p.cliente, conta_id, "9999999999.99")
    assert r.status_code == 200, r.text
    assert r.json()["lancamento"]["valor"] == "9999999999.99"
    assert _saldo(p.cliente, conta_id) == "9999999999.99"


# ------------------------------------------------------------------ I4 (t98): despesa com destino

def test_patch_de_despesa_com_conta_destino_responde_422_e_nao_altera_o_lancamento(fab, relogio):
    relogio(HOJE)
    c = fab.um_casal()
    contas = _contas(c.a.cliente)
    minha = next(x for x in contas if x["dono_usuario_id"] == c.a.id)
    conjunta = next(x for x in contas if x["dono_usuario_id"] is None)
    lanc = _lancar(c.a.cliente, minha["id"], "10.00", situacao="confirmada")
    r = c.a.cliente.patch(f"/api/lancamentos/{lanc['id']}", json={"conta_destino_id": conjunta["id"]})
    assert r.status_code == 422, r.text
    assert "conta_destino_id" in r.json()["erro"]["campos"]
    atual = c.a.cliente.get(f"/api/lancamentos/{lanc['id']}").json()
    assert atual["conta_destino_id"] is None
    assert _saldo(c.a.cliente, conjunta["id"]) == "0.00"


# ------------------------------------------------------------------ I1 (t98): mover de conta arquivada

def test_patch_nao_move_lancamento_para_fora_de_conta_arquivada(fab, relogio):
    relogio(HOJE)
    p = fab.uma_pessoa()
    conta_id = _contas(p.cliente)[0]["id"]
    lanc = _lancar(p.cliente, conta_id, "10.00", situacao="confirmada")
    p.cliente.post(f"/api/contas/{conta_id}/arquivar")
    outra = fab.uma_pessoa()  # conta alheia: o corpo vê como inexistente (422) ou arquivada (409)
    r = p.cliente.patch(f"/api/lancamentos/{lanc['id']}", json={"conta_id": _contas(outra.cliente)[0]["id"]})
    assert r.status_code in (409, 422), r.text
    assert p.cliente.get(f"/api/lancamentos/{lanc['id']}").json()["conta_id"] == conta_id


# ------------------------------------------------------------------ D-032: reajustes simultâneos

def _correr(tarefas, sessao_direta):
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
        try:
            return [f.result(timeout=PRAZO) for f in futuros]
        except TempoEsgotado:
            raise AssertionError("impasse: thread não terminou no prazo") from None


def _reajuste_tarefa(usuario_id, conta_id, saldo_real):
    def tarefa(db):
        ctx = contexto_do_usuario(db, usuario_id)
        return contas_service.reajustar(db, ctx, conta_id, Decimal(saldo_real))

    return tarefa


def test_dois_reajustes_simultaneos_sao_serializados_e_o_saldo_final_e_o_do_ultimo(
    fab, sessao_direta, relogio
):
    """D-032: o FOR UPDATE da conta serializa reajustes entre si (READ COMMITTED). O segundo a
    obter a trava calcula a diferença sobre o saldo já reajustado pelo primeiro; o saldo final é
    exatamente o `saldo_real` de um dos dois (nunca R1 + R2 - S) e os reajustes gravados somam
    a variação total."""
    relogio(HOJE)
    c = fab.um_casal()
    conjunta_id = next(x["id"] for x in _contas(c.a.cliente) if x["dono_usuario_id"] is None)
    c.a.cliente.patch(f"/api/contas/{conjunta_id}", json={"saldo_inicial": "100.00"})
    for i in range(REPETICOES):
        base = Decimal(_saldo(c.a.cliente, conjunta_id))
        r1, r2 = Decimal("500.00") + i, Decimal("700.00") + i
        res = _correr(
            [_reajuste_tarefa(c.a.id, conjunta_id, str(r1)),
             _reajuste_tarefa(c.b.id, conjunta_id, str(r2))],
            sessao_direta,
        )
        assert [x[0] for x in res] == ["ok", "ok"], res
        final = Decimal(_saldo(c.a.cliente, conjunta_id))
        assert final in (r1, r2), f"saldo final {final} não é nenhum dos pedidos {r1}/{r2}"
        # os reajustes gravados nesta rodada somam exatamente a variação do saldo
        lanc = c.a.cliente.get("/api/lancamentos", params={"mes": "2026-03", "conta_id": conjunta_id}).json()
        soma = sum(Decimal(x["valor"]) for x in lanc if x["tipo"] == "reajuste")
        assert Decimal("100.00") + soma == final
        assert final != base


def test_dois_reajustes_simultaneos_para_o_mesmo_valor_criam_um_so_ajuste(fab, sessao_direta, relogio):
    relogio(HOJE)
    c = fab.um_casal()
    conjunta_id = next(x["id"] for x in _contas(c.a.cliente) if x["dono_usuario_id"] is None)
    res = _correr(
        [_reajuste_tarefa(c.a.id, conjunta_id, "250.00"),
         _reajuste_tarefa(c.b.id, conjunta_id, "250.00")],
        sessao_direta,
    )
    assert [x[0] for x in res] == ["ok", "ok"], res
    criados = [x[1].lancamento for x in res if x[1].lancamento is not None]
    assert len(criados) == 1
    assert _saldo(c.a.cliente, conjunta_id) == "250.00"


def test_reajuste_nao_trava_criacao_de_lancamento_em_paralelo_documenta_efeito(
    fab, sessao_direta, relogio
):
    """D-032: só reajustes se serializam. Uma despesa confirmada criada em paralelo com um reajuste
    não fica na fila: o saldo final é saldo_real (se o reajuste vier depois da despesa) ou
    saldo_real - despesa (se vier antes). Nunca um valor fora desses dois."""
    relogio(HOJE)
    c = fab.um_casal()
    contas = _contas(c.a.cliente)
    minha = next(x for x in contas if x["dono_usuario_id"] == c.a.id)
    cat = _categoria(c.a.cliente, "Mercado")
    permitidos = set()
    for i in range(REPETICOES):
        base = Decimal(_saldo(c.a.cliente, minha["id"]))
        alvo = Decimal("1000.00") + i

        def despesa(db):
            from app.schemas.lancamento import DespesaEntrada
            from app.services import lancamentos

            entrada = DespesaEntrada(
                tipo="despesa", valor=Decimal("40.00"), data=HOJE, descricao="paralela",
                categoria_id=cat, dono_usuario_id=c.a.id, conta_id=minha["id"],
                situacao="confirmada",
            )
            return lancamentos.criar(db, contexto_do_usuario(db, c.a.id), entrada)

        res = _correr([_reajuste_tarefa(c.a.id, minha["id"], str(alvo)), despesa], sessao_direta)
        assert [x[0] for x in res] == ["ok", "ok"], res
        final = Decimal(_saldo(c.a.cliente, minha["id"]))
        assert final in (alvo, alvo - Decimal("40.00")), (base, alvo, final)
        permitidos.add(final - alvo)
    assert permitidos <= {Decimal("0.00"), Decimal("-40.00")}


def test_trava_da_conta_nao_causa_impasse_com_reajustes_em_contas_diferentes(fab, sessao_direta, relogio):
    relogio(HOJE)
    c = fab.um_casal()
    contas = _contas(c.a.cliente)
    ids = [x["id"] for x in contas]
    for i in range(REPETICOES):
        res = _correr(
            [_reajuste_tarefa(c.a.id, ids[0], str(10 + i)),
             _reajuste_tarefa(c.b.id, ids[1], str(20 + i)),
             _reajuste_tarefa(c.a.id, ids[2], str(30 + i))],
            sessao_direta,
        )
        assert all(x[0] == "ok" for x in res), res
    with sessao_direta() as db:
        assert db.execute(text("SELECT COUNT(*) FROM lancamento WHERE tipo = 'reajuste'")).scalar() >= 3
