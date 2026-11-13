import os
import re
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import text

from app.db import CONVENCAO_NOMES, Base, get_engine

BACKEND = Path(__file__).resolve().parents[1]
URL_REAL = os.environ.get("DATABASE_URL", "")


@pytest.fixture
def engine():
    get_engine.cache_clear()
    e = get_engine()
    yield e
    e.dispose()
    get_engine.cache_clear()


def _rodar(*args: str, **env: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, *args],
        cwd=BACKEND,
        env={**os.environ, **env},
        capture_output=True,
        check=False,
        text=True,
    )


def test_importar_app_db_nao_conecta():
    codigo = (
        "import app.db as d; "
        "assert d.get_engine.cache_info().currsize == 0; print('ok')"
    )
    r = _rodar("-c", codigo, DATABASE_URL="mysql+pymysql://u:p@127.0.0.1:1/inexistente")
    assert r.returncode == 0, r.stderr
    assert "ok" in r.stdout


def test_engine_tem_pool_pre_ping(engine):
    assert engine.pool._pre_ping is True


def test_engine_e_criada_sob_demanda_e_reaproveitada(engine):
    assert get_engine() is engine


def test_sessao_da_engine_usa_utc(engine):
    with engine.connect() as con:
        assert con.execute(text("SELECT @@session.time_zone")).scalar() == "+00:00"


def test_convencao_de_nomes_aplicada_ao_metadata():
    assert Base.metadata.naming_convention == CONVENCAO_NOMES
    assert set(CONVENCAO_NOMES) == {"ix", "uq", "ck", "fk", "pk"}
    assert CONVENCAO_NOMES["pk"] == "pk_%(table_name)s"
    assert CONVENCAO_NOMES["fk"] == "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"
    assert CONVENCAO_NOMES["uq"] == "uq_%(table_name)s_%(column_0_N_name)s"
    assert CONVENCAO_NOMES["ix"] == "ix_%(table_name)s_%(column_0_N_name)s"
    assert CONVENCAO_NOMES["ck"] == "ck_%(table_name)s_%(constraint_name)s"


@pytest.mark.migracoes
def test_alembic_upgrade_head_e_downgrade_base_sem_erro(guarda_banco_de_teste):
    for comando in (["upgrade", "head"], ["downgrade", "base"]):
        r = _rodar("-m", "alembic", *comando)
        assert r.returncode == 0, r.stderr


def test_alembic_revision_usa_script_py_mako_e_arquivo_e_apagado():
    versoes = BACKEND / "migrations" / "versions"
    antes = set(versoes.iterdir())
    r = _rodar("-m", "alembic", "revision", "-m", "x")
    novos = set(versoes.iterdir()) - antes
    try:
        assert r.returncode == 0, r.stderr
        arquivos = [p for p in novos if p.suffix == ".py"]
        assert len(arquivos) == 1
        conteudo = arquivos[0].read_text()
        assert "def upgrade() -> None:" in conteudo
        assert "def downgrade() -> None:" in conteudo
        # aponta para a cabeça atual (a primeira migração teria None)
        assert re.search(r"down_revision: str \| None = '\d{4}'", conteudo)
    finally:
        for p in novos:
            if p.is_file():
                p.unlink()
        cache = versoes / "__pycache__"
        if cache.exists() and cache not in antes:
            for f in cache.iterdir():
                f.unlink()
            cache.rmdir()
