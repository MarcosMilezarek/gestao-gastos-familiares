from dataclasses import dataclass

from sqlalchemy.orm import InstrumentedAttribute

from app.models.item_fatura import (
    ItemFatura,
    ItemFaturaTag,
    SerieCartao,
    SerieCartaoTag,
)
from app.models.lancamento import Lancamento, LancamentoTag
from app.models.recorrencia import Recorrencia, RecorrenciaTag


@dataclass(frozen=True)
class Alvo:
    # Tabela que aponta para a categoria ou para a tag.
    modelo: type
    # Coluna que guarda o id apontado.
    coluna: InstrumentedAttribute
    # Coluna de conta (lancamento.conta_id) que diz de quem é o registro.
    conta: InstrumentedAttribute
    # Só quando a tabela não tem a conta: coluna que leva ao lançamento dono da conta.
    ponte: InstrumentedAttribute | None = None


ALVOS_CATEGORIA = (
    Alvo(modelo=Lancamento, coluna=Lancamento.categoria_id, conta=Lancamento.conta_id),
    Alvo(modelo=Recorrencia, coluna=Recorrencia.categoria_id, conta=Recorrencia.conta_id),
    Alvo(modelo=ItemFatura, coluna=ItemFatura.categoria_id, conta=ItemFatura.conta_id),
    Alvo(modelo=SerieCartao, coluna=SerieCartao.categoria_id, conta=SerieCartao.conta_id),
)

ALVOS_TAG = (
    Alvo(
        modelo=LancamentoTag,
        coluna=LancamentoTag.tag_id,
        conta=Lancamento.conta_id,
        ponte=LancamentoTag.lancamento_id,
    ),
    Alvo(
        modelo=RecorrenciaTag,
        coluna=RecorrenciaTag.tag_id,
        conta=Recorrencia.conta_id,
        ponte=RecorrenciaTag.recorrencia_id,
    ),
    Alvo(
        modelo=ItemFaturaTag,
        coluna=ItemFaturaTag.tag_id,
        conta=ItemFatura.conta_id,
        ponte=ItemFaturaTag.item_fatura_id,
    ),
    Alvo(
        modelo=SerieCartaoTag,
        coluna=SerieCartaoTag.tag_id,
        conta=SerieCartao.conta_id,
        ponte=SerieCartaoTag.serie_cartao_id,
    ),
)
