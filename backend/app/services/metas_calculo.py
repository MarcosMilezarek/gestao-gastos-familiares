from dataclasses import dataclass
from decimal import Decimal

from app.money import porcentagem


@dataclass(frozen=True)
class Indicadores:
    valor_atual: Decimal
    aplicado_liquido: Decimal
    rendeu: Decimal
    falta: Decimal
    porcentagem: Decimal | None
    situacao: str


def indicadores(
    valor_alvo: Decimal,
    valor_inicial: Decimal,
    aplicacoes: Decimal,
    resgates: Decimal,
    rendimentos: Decimal,
) -> Indicadores:
    """valor_alvo é sempre maior que zero; por isso a porcentagem nunca é None."""
    aplicado_liquido = aplicacoes - resgates
    valor_atual = valor_inicial + aplicado_liquido + rendimentos
    return Indicadores(
        valor_atual=valor_atual,
        aplicado_liquido=aplicado_liquido,
        rendeu=rendimentos,
        falta=max(valor_alvo - valor_atual, Decimal(0)),
        porcentagem=porcentagem(valor_atual, valor_alvo),
        situacao="concluida" if valor_atual >= valor_alvo else "em_andamento",
    )
