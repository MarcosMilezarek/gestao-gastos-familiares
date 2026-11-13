from datetime import date
from decimal import Decimal

from app.money import porcentagem, quantizar
from app.services.proporcao import rateio

_ZERO = Decimal("0.00")
_CENTESIMO = Decimal("0.01")


def _centavos(valor: Decimal) -> int:
    return int(quantizar(valor).scaleb(2))


def _de_centavos(centavos: int) -> Decimal:
    return (Decimal(centavos) / 100).quantize(_CENTESIMO)


def dividir_renda(renda: Decimal, percentual: Decimal) -> tuple[Decimal, Decimal]:
    economia = quantizar(renda * percentual / 100)
    return renda - economia, economia


def resumo_orcamento(
    renda: Decimal, orcamento_gastos: Decimal, limites_das_categorias: list[Decimal]
) -> dict:
    gastos_planejados = sum(limites_das_categorias, _ZERO)
    balanco = renda - gastos_planejados
    return {
        "gastos_planejados": gastos_planejados,
        "total_categorizado": gastos_planejados,
        "falta_distribuir": max(orcamento_gastos - gastos_planejados, _ZERO),
        "excedente": max(gastos_planejados - orcamento_gastos, _ZERO),
        "balanco_planejado": balanco,
        "economia_planejada": porcentagem(balanco, renda),
    }


def linha_comparacao(
    limite: Decimal | None, gasto: Decimal
) -> tuple[Decimal | None, Decimal | None, bool]:
    if limite is None:
        return None, None, False
    return limite - gasto, porcentagem(gasto, limite), gasto > limite


def plano_de_metas(
    alvo: Decimal, atual: Decimal, mes_corrente: date, mes_alvo: date
) -> dict:
    meses = (mes_alvo.year - mes_corrente.year) * 12 + (mes_alvo.month - mes_corrente.month) + 1
    total = max(alvo - atual, _ZERO)
    total_c = _centavos(total)
    return {
        "meses": meses,
        "aplicacao_mensal": _de_centavos((total_c + meses - 1) // meses),
        "total_a_aplicar": total,
        "atingida": alvo <= atual,
    }


def resultado_cenario(
    renda_a: Decimal,
    renda_b: Decimal,
    despesas_casal: Decimal,
    despesas_a: Decimal,
    despesas_b: Decimal,
) -> dict:
    total_rendas = renda_a + renda_b
    total_despesas = despesas_casal + despesas_a + despesas_b
    resultado = {
        "total_rendas": total_rendas,
        "total_despesas": total_despesas,
        "saldo_mensal": total_rendas - total_despesas,
        "sem_proporcao": total_rendas == 0,
    }
    if total_rendas == 0:
        aporte_a = aporte_b = None
        porcentagem_a = porcentagem_b = None
    else:
        aporte_a, aporte_b = rateio(despesas_casal, renda_a, renda_b)
        porcentagem_a = porcentagem(renda_a, total_rendas)
        porcentagem_b = porcentagem(renda_b, total_rendas)
    sobra_a = None if aporte_a is None else renda_a - aporte_a - despesas_a
    sobra_b = None if aporte_b is None else renda_b - aporte_b - despesas_b
    resultado["a"] = {"porcentagem": porcentagem_a, "aporte": aporte_a, "sobra": sobra_a}
    resultado["b"] = {"porcentagem": porcentagem_b, "aporte": aporte_b, "sobra": sobra_b}
    return resultado
