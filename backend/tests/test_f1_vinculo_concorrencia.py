"""Fatia 1: corridas do vínculo com duas conexões reais (threads), sem impasse nem sobra de pendente."""
import itertools
import threading
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as TempoEsgotado

from sqlalchemy import text

from app.acesso import contexto_do_usuario
from app.errors import AppError
from app.models.casal import Convite
from app.services import vinculo

PRAZO = 30  # segundos; um impasse não pode travar a suíte
REPETICOES = 8


def _correr(sessao_direta, tarefas):
    """Roda cada `tarefa(db)` numa thread com sessão própria, largando juntas (barreira).

    Devolve, por tarefa, ("ok", valor) ou ("erro", excecao).
    """
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


def _aceitar(pessoa_id, convite_id):
    def tarefa(db):
        return vinculo.aceitar_convite(db, contexto_do_usuario(db, pessoa_id), convite_id)

    return tarefa


def _cancelar(pessoa_id, convite_id):
    def tarefa(db):
        return vinculo.cancelar_convite(db, contexto_do_usuario(db, pessoa_id), convite_id)

    return tarefa


def _recusar(pessoa_id, convite_id):
    def tarefa(db):
        return vinculo.recusar_convite(db, contexto_do_usuario(db, pessoa_id), convite_id)

    return tarefa


def _convidar(pessoa_id, email):
    def tarefa(db):
        return vinculo.convidar(db, contexto_do_usuario(db, pessoa_id), email)

    return tarefa


def _codigo(resultado) -> str | None:
    tipo, valor = resultado
    if tipo == "ok":
        return None
    assert isinstance(valor, AppError), f"erro inesperado (não é AppError): {valor!r}"
    return valor.codigo


def _convite(a, b):
    r = a.cliente.post("/api/convites", json={"email": b.email})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _consultar(sessao_direta, sql, **params):
    s = sessao_direta()
    try:
        return s.execute(text(sql), params).all()
    finally:
        s.rollback()


def _pendentes(sessao_direta) -> int:
    return _consultar(sessao_direta, "SELECT COUNT(*) FROM convite WHERE estado = 'pendente'")[0][0]


def _casais_ativos(sessao_direta) -> int:
    return _consultar(
        sessao_direta, "SELECT COUNT(*) FROM casal WHERE encerrado_em IS NULL"
    )[0][0]


def test_aceite_e_cancelamento_simultaneos_terminam_em_um_so_estado_final(fab, sessao_direta):
    vinculados = cancelados = 0
    for _ in range(REPETICOES):
        a, b = fab.uma_pessoa(), fab.uma_pessoa()
        convite_id = _convite(a, b)
        r_aceite, r_cancel = _correr(
            sessao_direta, [_aceitar(b.id, convite_id), _cancelar(a.id, convite_id)]
        )
        estado = _consultar(
            sessao_direta, "SELECT estado FROM convite WHERE id = :i", i=convite_id
        )[0][0]
        casais = _consultar(
            sessao_direta, "SELECT COUNT(*) FROM casal WHERE pessoa_a_id = :a", a=a.id
        )[0][0]
        if estado == "aceito":
            vinculados += 1
            assert r_aceite[0] == "ok"
            assert _codigo(r_cancel) == "CONVITE_NAO_PENDENTE"
            assert casais == 1
        else:
            cancelados += 1
            assert estado == "cancelado"
            assert r_cancel[0] == "ok"
            assert _codigo(r_aceite) == "CONVITE_NAO_PENDENTE"
            assert casais == 0
    assert vinculados + cancelados == REPETICOES
    assert _pendentes(sessao_direta) == 0


def test_convidar_e_aceitar_simultaneos_do_mesmo_usuario_nao_deixam_pendente_de_quem_tem_casal(
    fab, sessao_direta
):
    """t70r I2: B aceita o convite de A enquanto B convida C; B não pode sair vinculada e com pendente."""
    for _ in range(REPETICOES):
        a, b, c = fab.uma_pessoa(), fab.uma_pessoa(), fab.uma_pessoa()
        convite_id = _convite(a, b)
        r_aceite, r_convida = _correr(
            sessao_direta, [_aceitar(b.id, convite_id), _convidar(b.id, c.email)]
        )
        assert r_aceite[0] == "ok", r_aceite
        # Ou o convite de B saiu antes (e foi invalidado pelo aceite) ou foi recusado por JA_VINCULADO.
        if r_convida[0] == "erro":
            assert _codigo(r_convida) == "JA_VINCULADO"
        assert _casais_ativos(sessao_direta) >= 1
        pendentes_de_b = _consultar(
            sessao_direta,
            "SELECT COUNT(*) FROM convite WHERE estado = 'pendente' "
            "AND (convidante_id = :b OR convidado_id = :b)",
            b=b.id,
        )[0][0]
        assert pendentes_de_b == 0
        # reinicia o cenário para a próxima volta
        for t in ("convite", "casal"):
            _limpar(sessao_direta, t)


def _limpar(sessao_direta, tabela):
    """Esvazia convite/casal entre voltas; as pessoas ficam (as fixtures limpam tudo no fim)."""
    s = sessao_direta()
    s.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
    s.execute(text(f"DELETE FROM `{tabela}`"))
    s.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
    s.commit()


def test_dois_aceites_cruzados_nao_dao_impasse_nem_deixam_convite_pendente(fab, sessao_direta):
    """A convida B e B convida A; os dois aceitam ao mesmo tempo. Um casal, zero pendente."""
    for _ in range(REPETICOES):
        a, b = fab.uma_pessoa(), fab.uma_pessoa()
        de_a = _convite(a, b)
        de_b = _convite(b, a)
        r_b, r_a = _correr(sessao_direta, [_aceitar(b.id, de_a), _aceitar(a.id, de_b)])
        resultados = [r_a, r_b]
        for r in resultados:  # nenhum 500/impasse: só sucesso ou conflito de negócio
            assert r[0] == "ok" or _codigo(r) in {
                "CONVITE_NAO_PENDENTE",
                "JA_VINCULADO",
                "CONVIDADO_JA_VINCULADO",
            }, r
        assert sum(1 for r in resultados if r[0] == "ok") == 1
        assert _pendentes(sessao_direta) == 0
        assert _casais_ativos(sessao_direta) == 1
        for t in ("convite", "casal"):
            _limpar(sessao_direta, t)


def test_aceites_simultaneos_de_casais_distintos_sucedem_sem_impasse(fab, sessao_direta):
    """t70r I3: pares sem relação aceitando juntos não se travam em ciclo."""
    for _ in range(REPETICOES):
        a, b, c, d = (fab.uma_pessoa() for _ in range(4))
        ab, cd = _convite(a, b), _convite(c, d)
        r1, r2 = _correr(sessao_direta, [_aceitar(b.id, ab), _aceitar(d.id, cd)])
        assert r1[0] == "ok", r1
        assert r2[0] == "ok", r2
        assert _casais_ativos(sessao_direta) == 2
        assert _pendentes(sessao_direta) == 0
        for t in ("convite", "casal"):
            _limpar(sessao_direta, t)


def test_aceites_de_dois_convites_para_a_mesma_pessoa_vinculam_uma_vez(fab, sessao_direta):
    """C e A convidam B; B aceita os dois ao mesmo tempo: um casal só."""
    for _ in range(REPETICOES):
        a, b, c = fab.uma_pessoa(), fab.uma_pessoa(), fab.uma_pessoa()
        de_a, de_c = _convite(a, b), _convite(c, b)
        r1, r2 = _correr(sessao_direta, [_aceitar(b.id, de_a), _aceitar(b.id, de_c)])
        assert sorted(r[0] for r in (r1, r2)) == ["erro", "ok"], (r1, r2)
        erro = r1 if r1[0] == "erro" else r2
        assert _codigo(erro) in {"CONVITE_NAO_PENDENTE", "JA_VINCULADO"}
        assert _casais_ativos(sessao_direta) == 1
        assert _pendentes(sessao_direta) == 0
        for t in ("convite", "casal"):
            _limpar(sessao_direta, t)


def test_convidar_do_mesmo_convidante_em_paralelo_cria_um_so_pendente(fab, sessao_direta):
    for _ in range(REPETICOES):
        a, b, c = fab.uma_pessoa(), fab.uma_pessoa(), fab.uma_pessoa()
        r1, r2 = _correr(sessao_direta, [_convidar(a.id, b.email), _convidar(a.id, c.email)])
        assert sorted(r[0] for r in (r1, r2)) == ["erro", "ok"], (r1, r2)
        erro = r1 if r1[0] == "erro" else r2
        assert _codigo(erro) == "CONVITE_PENDENTE_EXISTE"
        assert _pendentes(sessao_direta) == 1
        for t in ("convite",):
            _limpar(sessao_direta, t)


def test_convidar_alguem_que_aceita_outro_convite_no_mesmo_instante_nao_deixa_pendente_para_vinculado(
    fab, sessao_direta
):
    """t98r S2: X convida Y enquanto Y aceita o convite de Z. Y vinculado não pode ter pendente recebido."""
    for _ in range(REPETICOES):
        x, y, z = fab.uma_pessoa(), fab.uma_pessoa(), fab.uma_pessoa()
        de_z = _convite(z, y)
        _correr(sessao_direta, [_convidar(x.id, y.email), _aceitar(y.id, de_z)])
        recebido_por_vinculado = _consultar(
            sessao_direta,
            "SELECT COUNT(*) FROM convite WHERE estado = 'pendente' AND convidado_id = :y",
            y=y.id,
        )[0][0]
        assert recebido_por_vinculado == 0, "convite pendente para pessoa já vinculada"
        for t in ("convite", "casal"):
            _limpar(sessao_direta, t)


def test_aceite_de_b_e_recusa_de_terceiro_menor_id_nao_dao_impasse_nem_deixam_pendente(
    fab, sessao_direta
):
    """t236r I1: A convidou B; B tem convite pendente para D com id(D) < id(B).

    B aceita A e D recusa B->D ao mesmo tempo: sem 500/impasse, um casal A-B, nenhum pendente de A ou B.
    """
    for _ in range(REPETICOES):
        d, b, a = fab.uma_pessoa(), fab.uma_pessoa(), fab.uma_pessoa()
        assert d.id < b.id
        de_b = _convite(b, d)
        de_a = _convite(a, b)
        r_aceite, r_recusa = _correr(sessao_direta, [_aceitar(b.id, de_a), _recusar(d.id, de_b)])
        assert r_aceite[0] == "ok", r_aceite
        if r_recusa[0] == "erro":  # o aceite invalidou B->D antes da recusa
            assert _codigo(r_recusa) == "CONVITE_NAO_PENDENTE"
        assert _casais_ativos(sessao_direta) == 1
        assert _pendentes(sessao_direta) == 0
        for t in ("convite", "casal"):
            _limpar(sessao_direta, t)


def _permutacao(n, volta):
    """Ordem de criação (ids crescentes) que varia por volta: terceiros ora menores, ora maiores."""
    todas = list(itertools.permutations(range(n)))
    return todas[(volta * 7) % len(todas)]


def _pessoas_em_ordem(fab, n, volta):
    criadas = [fab.uma_pessoa() for _ in range(n)]
    return [criadas[i] for i in _permutacao(n, volta)]


def test_aceite_com_recusa_e_cancelamento_de_dois_terceiros_nao_dao_impasse_nem_deixam_pendente(
    fab, sessao_direta
):
    """t236c2r: B->D e C->A pendentes juntos; B aceita A->B, D recusa B->D e C cancela C->A."""
    for volta in range(REPETICOES):
        a, b, c, d = _pessoas_em_ordem(fab, 4, volta)
        de_b = _convite(b, d)
        de_c = _convite(c, a)
        de_a = _convite(a, b)
        r_aceite, r_recusa, r_cancel = _correr(
            sessao_direta,
            [_aceitar(b.id, de_a), _recusar(d.id, de_b), _cancelar(c.id, de_c)],
        )
        assert r_aceite[0] == "ok", r_aceite
        for r in (r_recusa, r_cancel):  # o aceite pode ter invalidado antes
            if r[0] == "erro":
                assert _codigo(r) == "CONVITE_NAO_PENDENTE", r
        assert _casais_ativos(sessao_direta) == 1
        assert _pendentes(sessao_direta) == 0
        for t in ("convite", "casal"):
            _limpar(sessao_direta, t)


def test_dois_aceites_simultaneos_com_terceiro_em_comum_vinculam_os_dois_casais(fab, sessao_direta):
    """t236c2r: A->B e D->E pendentes, B->D pendente; B aceita A->B enquanto E aceita D->E."""
    for volta in range(REPETICOES):
        a, b, d, e = _pessoas_em_ordem(fab, 4, volta)
        de_b = _convite(b, d)
        de_a = _convite(a, b)
        de_d = _convite(d, e)
        r1, r2 = _correr(sessao_direta, [_aceitar(b.id, de_a), _aceitar(e.id, de_d)])
        assert r1[0] == "ok", r1
        assert r2[0] == "ok", r2
        estado_b_d = _consultar(
            sessao_direta, "SELECT estado FROM convite WHERE id = :i", i=de_b
        )[0][0]
        assert estado_b_d == "invalidado"
        assert _casais_ativos(sessao_direta) == 2
        assert _pendentes(sessao_direta) == 0
        for t in ("convite", "casal"):
            _limpar(sessao_direta, t)


def _convite_direto(sessao_direta, convidante_id, convidado_id):
    s = sessao_direta()
    convite = Convite(convidante_id=convidante_id, convidado_id=convidado_id, estado="pendente")
    s.add(convite)
    s.commit()
    return convite.id


def test_aceite_repete_quando_aparece_convite_novo_entre_a_leitura_e_a_trava(
    fab, sessao_direta, monkeypatch
):
    """Caminho de repetir, determinístico: D2->B surge na 1ª trava; o aceite repete e o invalida."""
    a, b, d2 = fab.uma_pessoa(), fab.uma_pessoa(), fab.uma_pessoa()
    de_a = _convite(a, b)
    original = vinculo._travar_usuarios
    chamadas = []

    def travar(db, ids):
        chamadas.append(sorted(ids))
        if len(chamadas) == 1:
            _convite_direto(sessao_direta, d2.id, b.id)
        return original(db, ids)

    monkeypatch.setattr(vinculo, "_travar_usuarios", travar)
    db = sessao_direta()
    vinculo.aceitar_convite(db, contexto_do_usuario(db, b.id), de_a)

    assert len(chamadas) == 2
    assert d2.id not in chamadas[0] and d2.id in chamadas[1]
    assert _casais_ativos(sessao_direta) == 1
    estados = _consultar(
        sessao_direta, "SELECT convidante_id, estado FROM convite WHERE convidado_id = :b", b=b.id
    )
    assert sorted(estados) == sorted([(a.id, "aceito"), (d2.id, "invalidado")])
    assert _pendentes(sessao_direta) == 0


def test_aceite_esgota_tres_voltas_com_erro_interno_sem_casal_nem_trava_presa(
    fab, sessao_direta, monkeypatch
):
    """Um convite novo a cada chamada: 3 voltas, 500 ERRO_INTERNO, sem casal; a pessoa segue operável."""
    a, b = fab.uma_pessoa(), fab.uma_pessoa()
    terceiros = [fab.uma_pessoa() for _ in range(3)]
    de_a = _convite(a, b)
    original = vinculo._travar_usuarios
    chamadas = []

    def travar(db, ids):
        if len(chamadas) < len(terceiros):
            _convite_direto(sessao_direta, terceiros[len(chamadas)].id, b.id)
        chamadas.append(1)
        return original(db, ids)

    monkeypatch.setattr(vinculo, "_travar_usuarios", travar)
    db = sessao_direta()
    try:
        vinculo.aceitar_convite(db, contexto_do_usuario(db, b.id), de_a)
        raise AssertionError("era esperado AppError")
    except AppError as erro:
        assert erro.status == 500
        assert erro.codigo == "ERRO_INTERNO"
    assert len(chamadas) == 3
    assert _casais_ativos(sessao_direta) == 0

    monkeypatch.setattr(vinculo, "_travar_usuarios", original)
    # Sem trava presa: outra sessão consegue travar e operar sobre A (cancelar o próprio convite).
    outra = sessao_direta()
    outra.execute(text("SET SESSION innodb_lock_wait_timeout = 3"))
    vinculo.cancelar_convite(outra, contexto_do_usuario(outra, a.id), de_a)
    assert _consultar(sessao_direta, "SELECT estado FROM convite WHERE id = :i", i=de_a)[0][0] == "cancelado"
