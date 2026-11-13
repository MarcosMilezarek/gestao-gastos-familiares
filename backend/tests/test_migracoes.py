"""Migrações 0001 a 0011 aplicadas em MySQL real (banco `_test`)."""
import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError, IntegrityError

BACKEND = Path(__file__).resolve().parents[1]
URL = os.environ.get("DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not URL.startswith("mysql") or not URL.rsplit("/", 1)[-1].split("?")[0].endswith("_test"),
    reason="exige DATABASE_URL de MySQL apontando para um banco terminado em _test",
)

TIPOS_ATE_0007 = {"despesa", "receita", "transferencia", "reajuste"}
TIPOS_0008 = TIPOS_ATE_0007 | {"pagamento_fatura"}
TIPOS_0010 = TIPOS_0008 | {"aplicacao", "resgate"}


def _alembic(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND,
        capture_output=True,
        text=True,
        check=False,
    )


def _ok(*args: str) -> str:
    r = _alembic(*args)
    assert r.returncode == 0, f"alembic {' '.join(args)} falhou:\n{r.stderr[-2000:]}"
    return r.stdout + r.stderr


@pytest.fixture(scope="module")
def eng():
    e = create_engine(URL)
    yield e
    e.dispose()


def _tabelas(eng) -> set[str]:
    with eng.connect() as c:
        return {
            r[0]
            for r in c.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = DATABASE()"
                )
            )
        }


@pytest.fixture(scope="module")
def ciclo(eng):
    """upgrade head -> downgrade base -> upgrade head; devolve o que sobrou após o downgrade."""
    _ok("downgrade", "base")
    _ok("upgrade", "head")
    _ok("downgrade", "base")
    sobra = _tabelas(eng)
    _ok("upgrade", "head")
    yield sobra


def _um(eng, sql: str, **p):
    with eng.connect() as c:
        return c.execute(text(sql), p).fetchall()


def _clausula_tipo(eng) -> str:
    return _um(
        eng,
        "SELECT cc.check_clause FROM information_schema.check_constraints cc "
        "JOIN information_schema.table_constraints tc "
        "ON tc.constraint_schema = cc.constraint_schema AND tc.constraint_name = cc.constraint_name "
        "WHERE tc.table_schema = DATABASE() AND tc.table_name = 'lancamento' "
        "AND tc.constraint_name = 'ck_lancamento_tipo'",
    )[0][0]


def _tipos_da_clausula(clausula: str) -> set[str]:
    import re

    return set(re.findall(r"_utf8mb4\\*'([a-z_]+)", clausula))


def test_ha_uma_so_cabeca():
    saida = _ok("heads")
    assert saida.count("(head)") == 1
    assert "0011" in saida


def test_upgrade_downgrade_upgrade_sem_erro_e_downgrade_deixa_so_alembic_version(ciclo):
    assert ciclo == {"alembic_version"}


def test_apos_novo_upgrade_banco_esta_na_0011(eng, ciclo):
    assert _um(eng, "SELECT version_num FROM alembic_version") == [("0011",)]


def test_nenhum_check_com_prefixo_duplicado(eng, ciclo):
    nomes = _um(
        eng,
        "SELECT constraint_name FROM information_schema.table_constraints "
        "WHERE table_schema = DATABASE() AND constraint_type = 'CHECK'",
    )
    assert nomes, "nenhum CHECK encontrado"
    assert [n[0] for n in nomes if "ck_ck_" in n[0]] == []
    assert all(n[0].startswith("ck_") for n in nomes)


def test_colunas_geradas_da_categoria_existem(eng, ciclo):
    linhas = _um(
        eng,
        "SELECT column_name, extra FROM information_schema.columns "
        "WHERE table_schema = DATABASE() AND table_name = 'categoria' "
        "AND column_name IN ('escopo', 'pai_chave')",
    )
    assert {n for n, _ in linhas} == {"escopo", "pai_chave"}
    assert all("STORED GENERATED" in e.upper() for _, e in linhas)


def test_coluna_gerada_do_convite_pendente_existe(eng, ciclo):
    linhas = _um(
        eng,
        "SELECT extra FROM information_schema.columns WHERE table_schema = DATABASE() "
        "AND table_name = 'convite' AND column_name = 'pendente_chave'",
    )
    assert len(linhas) == 1 and "GENERATED" in linhas[0][0].upper()


def test_uq_convite_pendente_chave_recusa_segundo_convite_pendente(eng, ciclo):
    with eng.begin() as c:
        c.execute(text("DELETE FROM convite"))
        c.execute(text("DELETE FROM usuario"))
        ids = []
        for i in range(3):
            c.execute(
                text("INSERT INTO usuario (nome, email, senha_hash) VALUES (:n, :e, 'x')"),
                {"n": f"u{i}", "e": f"u{i}@x.com"},
            )
            ids.append(c.execute(text("SELECT LAST_INSERT_ID()")).scalar())
        a, b, d = ids
        c.execute(
            text("INSERT INTO convite (convidante_id, convidado_id) VALUES (:a, :b)"),
            {"a": a, "b": b},
        )
    try:
        with pytest.raises(IntegrityError) as exc, eng.begin() as c:
            c.execute(
                text("INSERT INTO convite (convidante_id, convidado_id) VALUES (:a, :d)"),
                {"a": a, "d": d},
            )
        assert "uq_convite_pendente_chave" in str(exc.value)
        # convite não pendente do mesmo convidante é aceito (chave nula)
        with eng.begin() as c:
            c.execute(
                text(
                    "INSERT INTO convite (convidante_id, convidado_id, estado) "
                    "VALUES (:a, :d, 'recusado')"
                ),
                {"a": a, "d": d},
            )
    finally:
        with eng.begin() as c:
            c.execute(text("DELETE FROM convite"))
            c.execute(text("DELETE FROM usuario"))


@pytest.mark.parametrize(
    "tabela,coluna",
    [("categoria", "nome"), ("tag", "nome")],
)
def test_nome_de_categoria_e_tag_usa_collation_as_ci(eng, ciclo, tabela, coluna):
    assert _um(
        eng,
        "SELECT collation_name FROM information_schema.columns WHERE table_schema = DATABASE() "
        "AND table_name = :t AND column_name = :c",
        t=tabela,
        c=coluna,
    ) == [("utf8mb4_0900_as_ci",)]


def test_todas_as_fks_sao_restrict(eng, ciclo):
    linhas = _um(
        eng,
        "SELECT constraint_name, delete_rule FROM information_schema.referential_constraints "
        "WHERE constraint_schema = DATABASE()",
    )
    assert linhas
    assert [n for n, r in linhas if r != "RESTRICT"] == []


def test_dinheiro_e_decimal_12_2_e_percentual_e_decimal_5_2(eng, ciclo):
    linhas = _um(
        eng,
        "SELECT table_name, column_name, column_type FROM information_schema.columns "
        "WHERE table_schema = DATABASE() AND data_type IN ('decimal', 'float', 'double')",
    )
    assert linhas
    errados = [
        (t, c, ty)
        for t, c, ty in linhas
        if ty != ("decimal(5,2)" if (t, c) == ("orcamento", "percentual_economia") else "decimal(12,2)")
    ]
    assert errados == []


def test_ck_cenario_item_dono_existe_e_recusa_renda_sem_dono(eng, ciclo):
    existe = _um(
        eng,
        "SELECT 1 FROM information_schema.table_constraints WHERE table_schema = DATABASE() "
        "AND table_name = 'cenario_item' AND constraint_name = 'ck_cenario_item_dono' "
        "AND constraint_type = 'CHECK'",
    )
    assert existe


def test_ck_cenario_item_dono_aplicado_pelo_mysql(eng, ciclo):
    with eng.begin() as c:
        c.execute(text("DELETE FROM usuario"))
        c.execute(text("INSERT INTO usuario (nome, email, senha_hash) VALUES ('a','a@x.com','x')"))
        u = c.execute(text("SELECT LAST_INSERT_ID()")).scalar()
        c.execute(text("INSERT INTO usuario (nome, email, senha_hash) VALUES ('b','b@x.com','x')"))
        v = c.execute(text("SELECT LAST_INSERT_ID()")).scalar()
        c.execute(text("INSERT INTO casal (pessoa_a_id, pessoa_b_id) VALUES (:u, :v)"), {"u": u, "v": v})
        casal = c.execute(text("SELECT LAST_INSERT_ID()")).scalar()
    try:
        cols = _um(
            eng,
            "SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() "
            "AND table_name = 'cenario' AND is_nullable = 'NO' AND column_default IS NULL "
            "AND extra NOT LIKE '%auto_increment%'",
        )
        assert {n for (n,) in cols} <= {"casal_id", "nome"}, cols
        valores = {"casal_id": casal, "nome": "c"}
        nomes = [n for (n,) in cols]
        with eng.begin() as c:
            c.execute(
                text(
                    f"INSERT INTO cenario ({', '.join(nomes)}) "
                    f"VALUES ({', '.join(':' + n for n in nomes)})"
                ),
                {k: valores[k] for k in nomes},
            )
            cen = c.execute(text("SELECT LAST_INSERT_ID()")).scalar()
        with pytest.raises(DBAPIError) as exc, eng.begin() as c:
            c.execute(
                text(
                    "INSERT INTO cenario_item (cenario_id, tipo, descricao, valor) "
                    "VALUES (:c, 'renda', 'x', 1)"
                ),
                {"c": cen},
            )
        assert exc.value.orig.args[0] == 3819
        assert "ck_cenario_item_dono" in str(exc.value)
        with eng.begin() as c:
            c.execute(
                text(
                    "INSERT INTO cenario_item (cenario_id, tipo, descricao, valor) "
                    "VALUES (:c, 'despesa', 'x', 1)"
                ),
                {"c": cen},
            )
            c.execute(
                text(
                    "INSERT INTO cenario_item (cenario_id, tipo, dono_usuario_id, descricao, valor) "
                    "VALUES (:c, 'renda', :u, 'x', 1)"
                ),
                {"c": cen, "u": u},
            )
    finally:
        with eng.begin() as c:
            c.execute(text("DELETE FROM cenario_item"))
            c.execute(text("DELETE FROM cenario"))
            c.execute(text("DELETE FROM casal"))
            c.execute(text("DELETE FROM usuario"))


def test_clausula_do_head_tem_os_sete_tipos(eng, ciclo):
    assert _tipos_da_clausula(_clausula_tipo(eng)) == TIPOS_0010


def test_downgrade_da_0010_restaura_lista_da_0008(eng, ciclo):
    # ALTER ... DROP CHECK c, ADD CONSTRAINT c no mesmo comando (0010)
    try:
        _ok("downgrade", "0009")
        assert _um(eng, "SELECT version_num FROM alembic_version") == [("0009",)]
        assert _tipos_da_clausula(_clausula_tipo(eng)) == TIPOS_0008
    finally:
        _ok("upgrade", "head")


def test_downgrade_da_0008_restaura_lista_anterior(eng, ciclo):
    # ALTER ... DROP CHECK c, ADD CONSTRAINT c no mesmo comando (0008)
    try:
        _ok("downgrade", "0007")
        assert _um(eng, "SELECT version_num FROM alembic_version") == [("0007",)]
        assert _tipos_da_clausula(_clausula_tipo(eng)) == TIPOS_ATE_0007
    finally:
        _ok("upgrade", "head")
