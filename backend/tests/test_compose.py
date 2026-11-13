import os
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]

pytestmark = pytest.mark.skipif(shutil.which("docker") is None, reason="docker CLI ausente")


def _compose(*args: str, **env: str) -> subprocess.CompletedProcess:
    ambiente = {k: v for k, v in os.environ.items() if not k.startswith("MYSQL_")}
    ambiente.update(env)
    return subprocess.run(
        ["docker", "compose", *args],
        cwd=RAIZ,
        env=ambiente,
        capture_output=True,
        check=False,
        text=True,
    )


def test_compose_config_com_env_example_e_valido():
    r = _compose("--env-file", ".env.example", "config", "-q")
    assert r.returncode == 0, r.stderr


def test_script_de_init_do_banco_de_teste_tem_sintaxe_valida():
    r = subprocess.run(
        ["bash", "-n", "docker/mysql-init/01-banco-teste.sh"],
        cwd=RAIZ,
        capture_output=True,
        check=False,
        text=True,
    )
    assert r.returncode == 0, r.stderr


def test_porta_do_mysql_so_em_loopback_por_padrao():
    r = _compose("--env-file", ".env.example", "config", "--format", "json")
    assert r.returncode == 0, r.stderr
    import json

    portas = json.loads(r.stdout)["services"]["db"]["ports"]
    assert len(portas) == 1
    assert portas[0]["host_ip"] == "127.0.0.1"
    assert str(portas[0]["published"]) == "3306"


def test_mysql_porta_publica_127_0_0_1_3307():
    r = _compose("--env-file", ".env.example", "config", "--format", "json", MYSQL_PORTA="3307")
    assert r.returncode == 0, r.stderr
    import json

    porta = json.loads(r.stdout)["services"]["db"]["ports"][0]
    assert porta["host_ip"] == "127.0.0.1"
    assert str(porta["published"]) == "3307"


def test_sem_env_config_falha_citando_variavel_obrigatoria():
    r = _compose("config", "-q")
    assert r.returncode != 0
    assert "MYSQL_ROOT_PASSWORD" in r.stderr
