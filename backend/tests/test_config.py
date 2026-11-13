import pytest
from pydantic import ValidationError

from app.config import Settings


@pytest.fixture(autouse=True)
def ambiente_limpo(monkeypatch):
    for nome in ("DATABASE_URL", "APP_ENV", "COOKIE_SECURE", "ORIGENS_PERMITIDAS", "APP_TZ"):
        monkeypatch.delenv(nome, raising=False)
    monkeypatch.setitem(Settings.model_config, "env_file", None)


def _settings(monkeypatch, **env: str) -> Settings:
    monkeypatch.setenv("DATABASE_URL", "mysql+pymysql://u:p@h/x")
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    return Settings()


def test_database_url_ausente_derruba_settings():
    with pytest.raises(ValidationError) as exc:
        Settings()
    assert "DATABASE_URL" in str(exc.value)


def test_app_env_padrao_e_prod_com_cookie_secure_verdadeiro(monkeypatch):
    s = _settings(monkeypatch)
    assert s.APP_ENV == "prod"
    assert s.COOKIE_SECURE is True


def test_app_env_dev_deixa_cookie_secure_falso(monkeypatch):
    s = _settings(monkeypatch, APP_ENV="dev")
    assert s.COOKIE_SECURE is False


def test_cookie_secure_explicito_vence_em_dev(monkeypatch):
    s = _settings(monkeypatch, APP_ENV="dev", COOKIE_SECURE="true")
    assert s.COOKIE_SECURE is True


def test_cookie_secure_explicito_falso_vence_em_prod(monkeypatch):
    s = _settings(monkeypatch, APP_ENV="prod", COOKIE_SECURE="false")
    assert s.COOKIE_SECURE is False


def test_origens_permitidas_padrao(monkeypatch):
    assert _settings(monkeypatch).ORIGENS_PERMITIDAS == ["http://localhost:5173"]


def test_origens_permitidas_separadas_por_virgula_com_espacos(monkeypatch):
    s = _settings(monkeypatch, ORIGENS_PERMITIDAS="http://a.com, https://b.com ,")
    assert s.ORIGENS_PERMITIDAS == ["http://a.com", "https://b.com"]


def test_app_env_invalido_e_recusado(monkeypatch):
    with pytest.raises(ValidationError):
        _settings(monkeypatch, APP_ENV="staging")
