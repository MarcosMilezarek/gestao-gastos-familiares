from datetime import UTC, date, datetime

import pytest

from app import tempo
from app.config import get_settings
from app.errors import VALIDACAO, AppError


@pytest.fixture
def fuso(monkeypatch):
    def definir(nome: str):
        monkeypatch.setenv("APP_TZ", nome)
        get_settings.cache_clear()

    yield definir
    monkeypatch.undo()
    get_settings.cache_clear()


class _RelogioFixo(datetime):
    instante = datetime(2026, 1, 1, 1, 30, tzinfo=UTC)

    @classmethod
    def now(cls, tz=None):
        return cls.instante.astimezone(tz) if tz else cls.instante


def test_hoje_respeita_app_tz(monkeypatch, fuso):
    # 01:30 UTC de 1/jan: ainda 31/dez em Sao Paulo (-03), ja 1/jan em UTC.
    monkeypatch.setattr(tempo, "datetime", _RelogioFixo)
    fuso("America/Sao_Paulo")
    assert tempo.hoje() == date(2025, 12, 31)
    fuso("UTC")
    assert tempo.hoje() == date(2026, 1, 1)


def test_para_data_local_respeita_app_tz(fuso):
    fuso("America/Sao_Paulo")
    assert tempo.para_data_local(datetime(2026, 1, 1, 1, 30)) == date(2025, 12, 31)


def test_agora_utc_e_ingenuo():
    assert tempo.agora_utc().tzinfo is None


def test_somar_meses_fim_de_janeiro_cai_no_ultimo_dia_de_fevereiro():
    assert tempo.somar_meses(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert tempo.somar_meses(date(2024, 1, 31), 1) == date(2024, 2, 29)


def test_somar_meses_vira_o_ano_para_frente_e_para_tras():
    assert tempo.somar_meses(date(2026, 12, 15), 1) == date(2027, 1, 15)
    assert tempo.somar_meses(date(2026, 1, 15), -1) == date(2025, 12, 15)
    assert tempo.somar_meses(date(2026, 3, 10), 24) == date(2028, 3, 10)


def test_somar_meses_zero_e_identidade():
    assert tempo.somar_meses(date(2026, 5, 31), 0) == date(2026, 5, 31)


def test_validar_mes_recusa_antes_de_2000_01():
    with pytest.raises(AppError) as exc:
        tempo.validar_mes("1999-12", date(2026, 10, 30))
    assert exc.value.codigo == VALIDACAO
    assert exc.value.status == 422
    assert "mes" in exc.value.campos


def test_validar_mes_limites_aceitos():
    hoje = date(2026, 10, 30)
    assert tempo.validar_mes("2000-01", hoje) == date(2000, 1, 1)
    assert tempo.validar_mes("2036-10", hoje) == date(2036, 10, 1)


def test_validar_mes_recusa_alem_de_120_meses_a_frente():
    with pytest.raises(AppError):
        tempo.validar_mes("2036-11", date(2026, 10, 30))


@pytest.mark.parametrize("mes", ["2026-13", "2026-00", "26-01", "abc", "2026-1", ""])
def test_validar_mes_recusa_formato_ou_mes_invalido(mes):
    with pytest.raises(AppError):
        tempo.validar_mes(mes, date(2026, 10, 30))


def test_formatar_e_fim_do_mes():
    assert tempo.formatar_mes(date(2026, 3, 9)) == "2026-03"
    assert tempo.fim_do_mes(date(2024, 2, 10)) == date(2024, 2, 29)
    assert tempo.mes_ref(date(2026, 3, 9)) == date(2026, 3, 1)
