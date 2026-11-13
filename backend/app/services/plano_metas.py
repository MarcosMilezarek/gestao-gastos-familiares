from decimal import Decimal

from app import tempo
from app.errors import VALIDACAO, AppError
from app.money import para_str
from app.services import planejamento_calculo

_MENSAGEM_MES_ANTERIOR = "A data-alvo não pode ser anterior ao mês atual."


def calcular(valor_alvo: Decimal, valor_atual: Decimal, mes_alvo: str) -> dict:
    hoje = tempo.hoje()
    mes_corrente = tempo.mes_ref(hoje)
    try:
        mes = tempo.validar_mes(mes_alvo, hoje)
    except AppError as erro:
        raise AppError(
            422, VALIDACAO, erro.mensagem, campos={"mes_alvo": erro.campos["mes"]}
        ) from erro
    if mes < mes_corrente:
        raise AppError(
            422, VALIDACAO, _MENSAGEM_MES_ANTERIOR, campos={"mes_alvo": _MENSAGEM_MES_ANTERIOR}
        )
    resultado = planejamento_calculo.plano_de_metas(valor_alvo, valor_atual, mes_corrente, mes)
    return {
        "meses": resultado["meses"],
        "aplicacao_mensal": para_str(resultado["aplicacao_mensal"]),
        "total_a_aplicar": para_str(resultado["total_a_aplicar"]),
        "atingida": resultado["atingida"],
    }
