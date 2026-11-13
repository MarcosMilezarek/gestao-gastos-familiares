from datetime import date
from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app import tempo
from app.acesso import Contexto
from app.errors import VALIDACAO, AppError
from app.models.cartao import Cartao
from app.models.lancamento import Lancamento
from app.money import para_str
from app.schemas.projecao import MesProjecaoSaida, ProjecaoSaida
from app.services import faturas, ganchos, movimentos, saldos

_HORIZONTES = (3, 6, 12)
_ZERO = Decimal("0.00")


def calcular(
    db: Session, ctx: Contexto, horizonte: int, conta_id: int | None = None
) -> ProjecaoSaida:
    if horizonte not in _HORIZONTES:
        mensagem = "Informe um horizonte de 3, 6 ou 12 meses."
        raise AppError(422, VALIDACAO, mensagem, campos={"horizonte": mensagem})
    hoje = tempo.hoje()
    mes_corrente = tempo.mes_ref(hoje)
    meses = [tempo.somar_meses(mes_corrente, i) for i in range(horizonte)]
    fim = tempo.fim_do_mes(meses[-1])
    ganchos.antes_de_ler_periodo(db, ctx, fim)

    contas = movimentos.escopo_contas(db, ctx)
    if conta_id is not None:
        contas = [conta for conta in contas if conta.id == conta_id]
        if not contas:
            mensagem = "Conta não encontrada."
            raise AppError(422, VALIDACAO, mensagem, campos={"conta_id": mensagem})
    ids = [conta.id for conta in contas]
    saldo_atual = sum(saldos.saldos_atuais(db, ids).values(), _ZERO)

    entradas = [_ZERO] * horizonte
    saidas = [_ZERO] * horizonte
    transferencias_entrada = [_ZERO] * horizonte
    transferencias_saida = [_ZERO] * horizonte
    pagamentos_fatura = [_ZERO] * horizonte
    aplicacoes_menos_resgates = [_ZERO] * horizonte
    if ids:
        consulta = select(
            Lancamento.tipo,
            Lancamento.data,
            Lancamento.valor,
            Lancamento.conta_id,
            Lancamento.conta_destino_id,
        ).where(
            Lancamento.situacao == "prevista",
            Lancamento.data <= fim,
            or_(
                Lancamento.conta_id.in_(ids),
                Lancamento.conta_destino_id.in_(ids),
            ),
        )
        em_s = set(ids)
        for tipo, data, valor, origem, destino in db.execute(consulta):
            indice = _indice(data, mes_corrente)
            if tipo == "receita" and origem in em_s:
                entradas[indice] += valor
            elif tipo == "despesa" and origem in em_s:
                saidas[indice] += valor
            elif tipo == "transferencia":
                if destino in em_s:
                    transferencias_entrada[indice] += valor
                if origem in em_s:
                    transferencias_saida[indice] += valor
            elif tipo == "pagamento_fatura" and origem in em_s:
                pagamentos_fatura[indice] += valor
            elif tipo == "aplicacao" and origem in em_s:
                aplicacoes_menos_resgates[indice] += valor
            elif tipo == "resgate" and origem in em_s:
                aplicacoes_menos_resgates[indice] -= valor

        cartao_ids = list(db.scalars(select(Cartao.id).where(Cartao.conta_id.in_(ids))))
        if cartao_ids:
            calculadas = faturas.calcular(db, cartao_ids, ate_mes=meses[-1])
            for faturas_do_cartao in calculadas.values():
                for fatura in faturas_do_cartao:
                    if fatura.total > 0 and fatura.pagamento is None and fatura.vencimento <= fim:
                        indice = _indice(fatura.vencimento, mes_corrente)
                        pagamentos_fatura[indice] += fatura.total

    saldo = saldo_atual
    saida = []
    for i, mes in enumerate(meses):
        saldo = (
            saldo
            + entradas[i]
            - saidas[i]
            + transferencias_entrada[i]
            - transferencias_saida[i]
            - pagamentos_fatura[i]
            - aplicacoes_menos_resgates[i]
        )
        saida.append(
            MesProjecaoSaida(
                mes=tempo.formatar_mes(mes),
                previsto=i > 0,
                entradas=para_str(entradas[i]),
                saidas=para_str(saidas[i]),
                transferencias_entrada=para_str(transferencias_entrada[i]),
                transferencias_saida=para_str(transferencias_saida[i]),
                pagamentos_fatura=para_str(pagamentos_fatura[i]),
                aplicacoes_menos_resgates=para_str(aplicacoes_menos_resgates[i]),
                saldo_previsto=para_str(saldo),
            )
        )
    return ProjecaoSaida(conta_id=conta_id, horizonte=horizonte, meses=saida)


def _indice(data: date, mes_corrente: date) -> int:
    # Mês anterior ao corrente (atrasados e faturas vencidas) cai no corrente (RF-5.24).
    mes = tempo.mes_ref(data)
    return max(0, (mes.year - mes_corrente.year) * 12 + mes.month - mes_corrente.month)
