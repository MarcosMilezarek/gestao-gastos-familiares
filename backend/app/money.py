import re
from decimal import ROUND_HALF_UP, Decimal, localcontext
from typing import Annotated

from pydantic import AfterValidator, BeforeValidator

_CENTAVO = Decimal("0.01")
_LIMITE = Decimal("9999999999.99")
_PADRAO_TEXTO = re.compile(r"-?[0-9]{1,10}(\.[0-9]{1,2})?")
_MSG_FORMATO = "Valor monetário inválido; use até 2 casas, ex.: \"1234.50\"."


def _aceitar_texto(valor: object) -> Decimal:
    if isinstance(valor, str):
        if not _PADRAO_TEXTO.fullmatch(valor):
            raise ValueError(_MSG_FORMATO)
        return Decimal(valor)
    if isinstance(valor, Decimal):
        if not valor.is_finite() or valor.as_tuple().exponent < -2:
            raise ValueError(_MSG_FORMATO)
        return valor
    raise ValueError("Valor monetário deve ser texto, ex.: \"1234.50\".")


def _na_faixa(valor: Decimal) -> Decimal:
    if abs(valor) > _LIMITE:
        raise ValueError("Valor fora da faixa permitida (até 9.999.999.999,99).")
    return valor


Dinheiro = Annotated[
    Decimal,
    BeforeValidator(_aceitar_texto),
    AfterValidator(_na_faixa),
]


def quantizar(valor: Decimal) -> Decimal:
    return valor.quantize(_CENTAVO, rounding=ROUND_HALF_UP)


def para_str(valor: Decimal) -> str:
    return format(quantizar(valor), "f")


def porcentagem(parte: Decimal, total: Decimal) -> Decimal | None:
    if total == 0:
        return None
    with localcontext() as contexto:
        contexto.prec = 50
        return (parte * 100 / total).quantize(_CENTAVO, rounding=ROUND_HALF_UP)
