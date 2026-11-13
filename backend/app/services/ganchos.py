from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import tempo
from app.acesso import Contexto
from app.models.cartao import Cartao
from app.models.casal import Casal
from app.models.conta import Conta
from app.models.usuario import Usuario
from app.services import faturas, recorrencias, series_cartao, vinculo_dados


def ao_cadastrar(db: Session, usuario: Usuario) -> None:
    """Conta individual e categorias padrão (§4.8). Roda na transação do chamador; não faz commit."""
    vinculo_dados.ao_cadastrar(db, usuario)


def ao_vincular(db: Session, casal: Casal) -> None:
    """Conta conjunta e união de categorias e tags (§4.8). Roda na transação do chamador; não faz commit."""
    vinculo_dados.ao_vincular(db, casal)


def ao_desvincular(db: Session, casal: Casal) -> None:
    """Conjunta arquivada, cópia das listas do casal (§4.8) e encerramento das recorrências entre as individuais (regra 4 de comum.md §7.3). Roda na transação do chamador; não faz commit."""
    vinculo_dados.ao_desvincular(db, casal)
    recorrencias.encerrar_entre_individuais(db, casal)


def antes_de_ler_periodo(db: Session, ctx: Contexto, ate: date) -> None:
    """Gera as ocorrências até `ate` (§4.3). Roda na transação do chamador; a geração pode confirmar a transação (D5, fatia-3.md §6)."""
    recorrencias.garantir_ate(db, ctx, ate)
    series_cartao.garantir_ate(db, ctx, ate)


def ao_arquivar_conta(db: Session, conta: Conta) -> None:
    """Apaga as previstas futuras das recorrências da conta (RF-3.07, §4.4). Roda na transação do chamador; não faz commit."""
    recorrencias.apagar_previstas_da_conta(db, conta)


def base_cartao_conjunta(db: Session, casal_id: int, mes: date) -> Decimal:
    """Soma de `gasto_cartao` das contas conjuntas do casal no mês da fatura (RF-4.15, CA-4.15)."""
    conta_ids = list(db.scalars(select(Conta.id).where(Conta.casal_id == casal_id)))
    return sum(
        (gasto.total for gasto in faturas.gasto_cartao(db, conta_ids, mes)),
        Decimal("0.00"),
    )


def ajuste_cartao_previsto(db: Session, conta_ids: list[int], ate: date) -> dict[int, Decimal]:
    """Soma das faturas não pagas e sem pagamento vencidas até `ate` por conta (§4.2, CA-4.24). Traz toda conta de `conta_ids`, com zero se não houver fatura."""
    ajustes = {conta_id: Decimal("0.00") for conta_id in conta_ids}
    cartao_ids = list(db.scalars(select(Cartao.id).where(Cartao.conta_id.in_(conta_ids))))
    if not cartao_ids:
        return ajustes
    calculadas = faturas.calcular(db, cartao_ids, ate_mes=tempo.mes_ref(ate))
    for faturas_do_cartao in calculadas.values():
        for fatura in faturas_do_cartao:
            if fatura.vencimento <= ate and fatura.total > 0 and fatura.pagamento is None:
                ajustes[fatura.conta_id] += fatura.total
    return ajustes
