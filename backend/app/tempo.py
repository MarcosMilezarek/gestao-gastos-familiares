import calendar
import re
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from app.config import get_settings
from app.errors import VALIDACAO, AppError

_PADRAO_MES = re.compile(r"[0-9]{4}-[0-9]{2}")
_MES_MINIMO = date(2000, 1, 1)
_MESES_A_FRENTE = 120


def agora_utc() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def hoje() -> date:
    return datetime.now(ZoneInfo(get_settings().APP_TZ)).date()


def mes_ref(d: date) -> date:
    return d.replace(day=1)


def parse_mes(mes: str) -> date:
    if not _PADRAO_MES.fullmatch(mes):
        raise ValueError(f"Mês inválido: {mes!r}")
    ano, numero = mes.split("-")
    return date(int(ano), int(numero), 1)


def formatar_mes(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def fim_do_mes(d: date) -> date:
    return date(d.year, d.month, calendar.monthrange(d.year, d.month)[1])


def somar_meses(d: date, n: int) -> date:
    indice = d.year * 12 + (d.month - 1) + n
    ano, mes = divmod(indice, 12)
    mes += 1
    ultimo_dia = calendar.monthrange(ano, mes)[1]
    return date(ano, mes, min(d.day, ultimo_dia))


def validar_mes(mes: str, hoje: date) -> date:
    maximo = mes_ref(somar_meses(hoje, _MESES_A_FRENTE))
    try:
        primeiro_dia = parse_mes(mes)
    except ValueError:
        primeiro_dia = None
    if primeiro_dia is None or not _MES_MINIMO <= primeiro_dia <= maximo:
        raise AppError(
            422,
            VALIDACAO,
            f"Informe um mês entre 2000-01 e {formatar_mes(maximo)}, no formato AAAA-MM.",
            campos={"mes": f"Informe um mês entre 2000-01 e {formatar_mes(maximo)}."},
        )
    return primeiro_dia


def validar_data(data: date, hoje: date) -> date:
    if not _MES_MINIMO <= data <= somar_meses(hoje, _MESES_A_FRENTE):
        mensagem = "Informe uma data entre 2000-01-01 e 10 anos à frente."
        raise AppError(422, VALIDACAO, mensagem, campos={"data": mensagem})
    return data


def para_data_local(dt: datetime) -> date:
    return dt.replace(tzinfo=UTC).astimezone(ZoneInfo(get_settings().APP_TZ)).date()
