from datetime import date
from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app import tempo
from app.acesso import Contexto, conta_visivel, filtro_contas
from app.models.casal import Casal
from app.models.categoria import Categoria
from app.models.conta import Conta
from app.models.lancamento import Lancamento
from app.services import faturas, ganchos
from app.services.filtros_lista import Linha, situacao_da_fatura
from app.services.saldos import eh_aporte, situacao_exibida

_CLASSE_POR_TIPO = {
    "despesa": "despesa_conta",
    "receita": "receita",
    "reajuste": "reajuste",
    "aplicacao": "aplicacao_resgate",
    "resgate": "aplicacao_resgate",
}
_CLASSES_SAIDA = ("despesa_conta", "despesa_cartao")


def escopo_contas(db: Session, ctx: Contexto, conta_ids: list[int] | None = None) -> list[Conta]:
    if conta_ids:
        return [conta_visivel(db, ctx, conta_id) for conta_id in conta_ids]
    contas = db.scalars(select(Conta).where(filtro_contas(ctx), Conta.arquivado == 0)).all()
    casal = db.get(Casal, ctx.casal_ativo_id) if ctx.casal_ativo_id is not None else None
    pessoa_a = casal.pessoa_a_id if casal is not None else ctx.usuario_id
    pessoa_b = casal.pessoa_b_id if casal is not None else None
    return sorted(contas, key=lambda conta: (_ordem(conta, pessoa_a, pessoa_b), conta.id))


def _ordem(conta: Conta, pessoa_a: int, pessoa_b: int | None) -> int:
    if conta.usuario_id is None:
        return 0
    if conta.usuario_id == pessoa_a:
        return 1
    if conta.usuario_id == pessoa_b:
        return 2
    return 3


def carregar_mes(db: Session, ctx: Contexto, mes: date, contas: list[Conta]) -> list[Linha]:
    ganchos.antes_de_ler_periodo(db, ctx, tempo.fim_do_mes(mes))
    if not contas:
        return []
    inicio = tempo.mes_ref(mes)
    fim = tempo.fim_do_mes(mes)
    conta_ids = [conta.id for conta in contas]
    lancamentos = db.scalars(
        select(Lancamento).where(
            Lancamento.data.between(inicio, fim),
            or_(
                Lancamento.conta_id.in_(conta_ids),
                Lancamento.conta_destino_id.in_(conta_ids),
            ),
            Lancamento.tipo != "pagamento_fatura",
        )
    ).all()
    # As pontas das transferências entram só para classificar: nome de conta não sai daqui.
    pontas = set(conta_ids) | {
        ponta
        for lancamento in lancamentos
        for ponta in (lancamento.conta_id, lancamento.conta_destino_id)
        if ponta is not None
    }
    contas_por_id = {
        conta.id: conta for conta in db.scalars(select(Conta).where(Conta.id.in_(pontas)))
    }
    gastos = faturas.gasto_cartao(db, conta_ids, inicio)
    vencimentos = {}
    if gastos:
        calculadas = faturas.calcular(
            db, sorted({gasto.cartao_id for gasto in gastos}), ate_mes=inicio
        )
        vencimentos = {
            fatura.cartao_id: fatura.vencimento
            for faturas_do_cartao in calculadas.values()
            for fatura in faturas_do_cartao
            if fatura.mes == inicio
        }
    categorias_usadas = {lancamento.categoria_id for lancamento in lancamentos} | {
        gasto.categoria_id for gasto in gastos
    }
    raizes = _categorias_raiz(db, categorias_usadas - {None})
    hoje = tempo.hoje()
    linhas = [
        _linha_lancamento(lancamento, contas_por_id, raizes, hoje)
        for lancamento in lancamentos
    ]
    linhas += [
        _linha_cartao(gasto, contas_por_id, vencimentos, raizes) for gasto in gastos
    ]
    return linhas


def gasto_por_categoria(db: Session, ctx: Contexto, mes: date) -> dict[int | None, Decimal]:
    linhas = carregar_mes(db, ctx, mes, escopo_contas(db, ctx))
    gastos: dict[int | None, Decimal] = {}
    for linha in linhas:
        if linha.classe in _CLASSES_SAIDA:
            gastos[linha.categoria_id] = gastos.get(linha.categoria_id, Decimal(0)) + linha.valor
    return gastos


def _categorias_raiz(db: Session, ids: set[int]) -> dict[int, int]:
    if not ids:
        return {}
    pais = db.execute(
        select(Categoria.id, Categoria.categoria_pai_id).where(Categoria.id.in_(ids))
    ).all()
    return {id_: pai if pai is not None else id_ for id_, pai in pais}


def _linha_lancamento(
    lancamento: Lancamento,
    contas_por_id: dict[int, Conta],
    raizes: dict[int, int],
    hoje: date,
) -> Linha:
    origem = contas_por_id[lancamento.conta_id]
    if lancamento.tipo == "transferencia":
        destino = contas_por_id[lancamento.conta_destino_id]
        classe = "aporte" if eh_aporte(lancamento, origem, destino) else "transferencia"
        dono = origem.usuario_id
    else:
        classe = _CLASSE_POR_TIPO[lancamento.tipo]
        dono = (
            lancamento.dono_usuario_id
            if lancamento.tipo in ("despesa", "receita")
            else origem.usuario_id
        )
    situacao = situacao_exibida(lancamento.situacao, lancamento.data, hoje)
    return Linha(
        origem="lancamento",
        id=lancamento.id,
        classe=classe,
        data=lancamento.data,
        valor=lancamento.valor,
        conta_id=lancamento.conta_id,
        conta_destino_id=lancamento.conta_destino_id,
        dono=dono,
        categoria_id=lancamento.categoria_id,
        categoria_raiz_id=raizes.get(lancamento.categoria_id),
        cartao_id=None,
        situacao=situacao,
        realizada=situacao == "confirmada",
    )


def _linha_cartao(
    gasto: faturas.GastoCartao,
    contas_por_id: dict[int, Conta],
    vencimentos: dict[int, date],
    raizes: dict[int, int],
) -> Linha:
    situacao = situacao_da_fatura(gasto.status)
    return Linha(
        origem="cartao",
        id=None,
        classe="despesa_cartao",
        data=vencimentos[gasto.cartao_id],
        valor=gasto.total,
        conta_id=gasto.conta_id,
        conta_destino_id=None,
        dono=contas_por_id[gasto.conta_id].usuario_id,
        categoria_id=gasto.categoria_id,
        categoria_raiz_id=raizes.get(gasto.categoria_id),
        cartao_id=gasto.cartao_id,
        situacao=situacao,
        realizada=gasto.paga,
    )
