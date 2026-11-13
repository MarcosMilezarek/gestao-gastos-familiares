from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from app.money import quantizar
from app.tempo import fim_do_mes, mes_ref, somar_meses

_ZERO = Decimal(0)


@dataclass(frozen=True)
class EntradaFatura:
    mes: date
    bruto: Decimal
    pago: Decimal | None


@dataclass(frozen=True)
class TotalFatura:
    mes: date
    total: Decimal
    credito_recebido: Decimal
    credito_repassado: Decimal


def dia_no_mes(mes_ref: date, dia: int) -> date:
    return date(mes_ref.year, mes_ref.month, min(dia, fim_do_mes(mes_ref).day))


def datas_da_fatura(mes_ref: date, dia_fech: int, dia_venc: int) -> tuple[date, date]:
    vencimento = dia_no_mes(mes_ref, dia_venc)
    mes_do_fechamento = mes_ref if dia_venc > dia_fech else somar_meses(mes_ref, -1)
    return dia_no_mes(mes_do_fechamento, dia_fech), vencimento


def mes_da_fatura(data: date, dia_fech: int, dia_venc: int) -> date:
    fecha_neste = data.day <= dia_no_mes(mes_ref(data), dia_fech).day
    mes_do_fechamento = mes_ref(data) if fecha_neste else somar_meses(mes_ref(data), 1)
    return somar_meses(mes_do_fechamento, 1) if dia_venc <= dia_fech else mes_do_fechamento


def status_fatura(
    total: Decimal, paga: bool, hoje: date, fechamento: date, vencimento: date
) -> str:
    if paga:
        return "paga"
    if hoje <= fechamento:
        return "aberta"
    if total == 0:
        return "zerada"
    if hoje <= vencimento:
        return "fechada"
    return "vencida"


def totais_em_cadeia(faturas: Sequence[EntradaFatura]) -> list[TotalFatura]:
    carry = _ZERO
    totais = []
    for fatura in faturas:
        if fatura.pago is None:
            total = max(fatura.bruto - carry, _ZERO)
            carry_novo = max(carry - fatura.bruto, _ZERO)
            recebido = min(carry, max(fatura.bruto, _ZERO))
        else:
            total = fatura.pago
            absorvido = max(fatura.bruto - fatura.pago, _ZERO)
            carry_novo = max(carry - absorvido, _ZERO)
            recebido = min(carry, absorvido)
        carry = carry_novo
        totais.append(
            TotalFatura(
                mes=fatura.mes,
                total=total,
                credito_recebido=recebido,
                credito_repassado=carry,
            )
        )
    return totais


def dividir_parcelas(total: Decimal, n: int) -> list[Decimal]:
    total_c = int(quantizar(total) * 100)
    base = total_c // n
    primeira = total_c - base * (n - 1)
    return [Decimal(primeira).scaleb(-2)] + [Decimal(base).scaleb(-2)] * (n - 1)
