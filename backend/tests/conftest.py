import os
import subprocess
import sys
from collections.abc import Callable, Iterator
from datetime import date
from pathlib import Path

import pytest

# Permite `.venv/bin/pytest` puro importar `app` (sem pyproject com pythonpath).
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Valor de mentira só para Settings validar na importação; testes que abrem conexão
# usam a DATABASE_URL real do ambiente (banco _test).
os.environ.setdefault("DATABASE_URL", "mysql+pymysql://u:p@localhost:3306/x")

BACKEND = Path(__file__).resolve().parents[1]
# Arquivos inteiros que derrubam/recriam o esquema: rodada separada (-m migracoes).
_ARQUIVOS_MIGRACOES = {"test_migracoes.py"}


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "migracoes: derruba/recria o esquema do banco _test; rodar sozinho com `-m migracoes`",
    )


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    for item in items:
        if Path(str(item.path)).name in _ARQUIVOS_MIGRACOES:
            item.add_marker(pytest.mark.migracoes)
    # Sem `-m` explícito, a rodada padrão exclui as migrações (não deixam o esquema em `head`).
    if config.getoption("-m"):
        return
    escolhidos = [i for i in items if "migracoes" not in i.keywords]
    if len(escolhidos) != len(items):
        config.hook.pytest_deselected(items=[i for i in items if i not in escolhidos])
        items[:] = escolhidos


# ---------------------------------------------------------------- banco real

def _url() -> str:
    return os.environ.get("DATABASE_URL", "")


def _nome_do_banco(url: str) -> str:
    return url.rsplit("/", 1)[-1].split("?")[0]


@pytest.fixture(scope="session")
def guarda_banco_de_teste() -> str:
    """Recusa rodar teste de banco se a DATABASE_URL não for MySQL com nome terminado em _test."""
    url = _url()
    if not url.startswith("mysql") or not _nome_do_banco(url).endswith("_test"):
        pytest.fail(
            "Teste de banco recusado: DATABASE_URL deve ser MySQL e o banco deve terminar em _test.",
            pytrace=False,
        )
    return url


def _limpar_tabelas(engine) -> None:
    from sqlalchemy import text

    with engine.begin() as con:
        con.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
        try:
            tabelas = con.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = DATABASE() AND table_name <> 'alembic_version'"
                )
            ).scalars().all()
            for t in tabelas:
                con.execute(text(f"TRUNCATE TABLE `{t}`"))
        finally:
            con.execute(text("SET FOREIGN_KEY_CHECKS = 1"))


@pytest.fixture(scope="session")
def banco_migrado(guarda_banco_de_teste: str) -> Iterator[None]:
    """`alembic upgrade head` uma vez por sessão; o esquema não é derrubado ao final."""
    r = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND,
        capture_output=True,
        text=True,
        check=False,
    )
    assert r.returncode == 0, f"alembic upgrade head falhou:\n{r.stderr[-2000:]}"
    yield


@pytest.fixture
def banco(banco_migrado: None) -> Iterator[None]:
    """Banco limpo antes e depois do teste (TRUNCATE; ver DECISÕES da t234)."""
    from app.db import get_engine

    get_engine.cache_clear()
    engine = get_engine()
    _limpar_tabelas(engine)
    try:
        yield
    finally:
        _limpar_tabelas(engine)
        engine.dispose()
        get_engine.cache_clear()


@pytest.fixture
def fab(banco: None) -> Iterator["Fabrica"]:  # noqa: F821
    from fabricas import Fabrica

    f = Fabrica()
    try:
        yield f
    finally:
        f.fechar()


@pytest.fixture
def sessao_direta(banco: None) -> Iterator[Callable[[], "Session"]]:  # noqa: F821
    """Fábrica de Sessions SQLAlchemy em conexões separadas (READ COMMITTED), p/ concorrência."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    engines = []
    sessoes: list[Session] = []

    def nova() -> Session:
        e = create_engine(
            _url(),
            connect_args={"init_command": "SET time_zone = '+00:00'"},
            isolation_level="READ COMMITTED",
        )
        engines.append(e)
        s = Session(bind=e)
        sessoes.append(s)
        return s

    try:
        yield nova
    finally:
        for s in sessoes:
            s.close()
        for e in engines:
            e.dispose()


@pytest.fixture
def relogio(monkeypatch: pytest.MonkeyPatch) -> Callable[[date], None]:
    """`relogio(date(2026, 3, 15))` fixa `tempo.hoje()` em todos os módulos que o importaram."""
    from app import tempo

    atual = tempo.hoje  # a função hoje vigente nos módulos; muda a cada `fixar`

    def fixar(dia: date) -> None:
        nonlocal atual

        def falso() -> date:
            return dia

        for nome, modulo in list(sys.modules.items()):
            if nome.startswith("app.") and getattr(modulo, "hoje", None) is atual:
                monkeypatch.setattr(modulo, "hoje", falso)
        monkeypatch.setattr(tempo, "hoje", falso)
        atual = falso

    return fixar
