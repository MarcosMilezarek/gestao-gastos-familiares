from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.acesso import Contexto, filtro_contas
from app.models.cartao import Cartao
from app.models.conta import Conta
from app.models.lancamento import Lancamento
from app.money import para_str
from app.schemas.cartao import FaturaResumo
from app.schemas.inicio import CardsInicio, InicioSaida, SaldoCard
from app.services import (
    balanco,
    faturas,
    ganchos,
    lista_controle,
    projecao,
    proporcao,
    relatorios,
    saldos,
)
from app.services.cartoes import resumo_fatura
from app.services.movimentos import escopo_contas
from app.tempo import fim_do_mes, formatar_mes, hoje, mes_ref

_ZERO = Decimal("0.00")
_TIPOS_PENDENTES = ("despesa", "receita", "transferencia")


def montar(db: Session, ctx: Contexto) -> InicioSaida:
    dia = hoje()
    mes = mes_ref(dia)
    ganchos.antes_de_ler_periodo(db, ctx, fim_do_mes(mes))
    contas = escopo_contas(db, ctx)
    conta_ids = [conta.id for conta in contas]
    atuais = saldos.saldos_atuais(db, conta_ids)
    return InicioSaida(
        mes=formatar_mes(mes),
        hoje=dia,
        cards=CardsInicio(
            saldos=[
                SaldoCard(
                    conta_id=conta.id,
                    nome=conta.nome,
                    dono_usuario_id=conta.usuario_id,
                    saldo_atual=para_str(atuais[conta.id]),
                )
                for conta in contas
            ],
            total_faturas_mes=para_str(_total_faturas_mes(db, ctx, mes)),
        ),
        proporcao=None
        if ctx.casal_ativo_id is None
        else proporcao.proporcao_do_mes(db, ctx, mes),
        pendentes=lista_controle.itens_de_lancamentos(
            db, ctx, _pendentes(db, conta_ids, dia)
        ),
        despesas_por_categoria=relatorios.categorias(db, ctx, mes),
        balanco_contas=balanco.calcular(db, ctx, mes).contas,
        proximas_faturas=_proximas_faturas(db, ctx),
        projecao=projecao.calcular(db, ctx, 6),
    )


def _total_faturas_mes(db: Session, ctx: Contexto, mes: date) -> Decimal:
    return sum(
        (fatura.total for fatura in faturas.faturas_do_mes(db, ctx, mes)), _ZERO
    )


def _pendentes(db: Session, conta_ids: list[int], ate: date) -> list[Lancamento]:
    return db.scalars(
        select(Lancamento)
        .where(
            Lancamento.conta_id.in_(conta_ids),
            Lancamento.tipo.in_(_TIPOS_PENDENTES),
            Lancamento.situacao == "prevista",
            Lancamento.data <= ate,
        )
        .order_by(Lancamento.data, Lancamento.id)
    ).all()


def _proximas_faturas(db: Session, ctx: Contexto) -> list[FaturaResumo]:
    cartoes = db.scalars(
        select(Cartao)
        .join(Conta, Conta.id == Cartao.conta_id)
        .where(filtro_contas(ctx), Conta.arquivado == 0)
        .order_by(Cartao.id)
    ).all()
    calculadas = faturas.calcular(db, [cartao.id for cartao in cartoes])
    saida = []
    for cartao in cartoes:
        nao_pagas = [
            fatura
            for fatura in calculadas[cartao.id]
            if fatura.total > 0
            and (fatura.pagamento is None or fatura.pagamento.situacao != "confirmada")
        ]
        if nao_pagas:
            proxima = min(nao_pagas, key=lambda fatura: fatura.vencimento)
            saida.append(resumo_fatura(cartao, proxima))
    return saida
