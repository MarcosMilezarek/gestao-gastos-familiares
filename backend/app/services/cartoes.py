from decimal import Decimal

from sqlalchemy import delete, exists, select
from sqlalchemy.orm import Session

from app.acesso import Contexto, cartao_visivel, filtro_contas
from app.errors import CARTAO_COM_COMPRAS, CONTA_ARQUIVADA, VALIDACAO, AppError
from app.models.cartao import Cartao, Fatura
from app.models.conta import Conta
from app.models.item_fatura import ItemFatura, SerieCartao
from app.models.lancamento import Lancamento
from app.money import para_str, porcentagem
from app.schemas.cartao import (
    CartaoEdicao,
    CartaoEntrada,
    CartaoSaida,
    CartoesSaida,
    FaturaResumo,
    PagamentoSaida,
)
from app.services import faturas, ganchos
from app.services.faturas import FaturaCalculada
from app.tempo import fim_do_mes, formatar_mes, hoje, mes_ref


def resumo_fatura(cartao: Cartao, calculada: FaturaCalculada) -> FaturaResumo:
    pagamento = calculada.pagamento
    return FaturaResumo(
        cartao_id=cartao.id,
        cartao_nome=cartao.nome,
        conta_id=cartao.conta_id,
        mes=formatar_mes(calculada.mes),
        id=calculada.id,
        status=calculada.status,
        fechamento=calculada.fechamento,
        vencimento=calculada.vencimento,
        valor=para_str(calculada.total),
        pagamento=None
        if pagamento is None
        else PagamentoSaida(
            lancamento_id=pagamento.lancamento_id,
            data=pagamento.data,
            situacao=pagamento.situacao,
            valor=para_str(pagamento.valor),
        ),
    )


def _montar(db: Session, linhas: list[tuple[Cartao, Conta]]) -> list[CartaoSaida]:
    if not linhas:
        return []
    agora = hoje()
    mes = mes_ref(agora)
    ids = [cartao.id for cartao, _ in linhas]
    usados = faturas.limite_usado(db, ids)
    calculadas = faturas.calcular(db, ids, ate_mes=mes, hoje=agora)
    saidas = []
    for cartao, conta in linhas:
        corrente = next((f for f in calculadas.get(cartao.id, []) if f.mes == mes), None)
        if corrente is None:
            corrente = faturas.fatura_virtual(cartao, mes, agora)
        usado = usados[cartao.id]
        uso = porcentagem(usado, cartao.limite)
        saidas.append(
            CartaoSaida(
                id=cartao.id,
                nome=cartao.nome,
                conta_id=cartao.conta_id,
                dono_usuario_id=conta.usuario_id,
                limite=para_str(cartao.limite),
                dia_fechamento=cartao.dia_fechamento,
                dia_vencimento=cartao.dia_vencimento,
                bandeira=cartao.bandeira,
                conta_arquivada=bool(conta.arquivado),
                limite_usado=para_str(usado),
                limite_disponivel=para_str(cartao.limite - usado),
                uso_porcentagem=None if uso is None else para_str(uso),
                fatura_corrente=resumo_fatura(cartao, corrente),
            )
        )
    return saidas


def _cartao_e_conta(db: Session, ctx: Contexto, cartao_id: int) -> tuple[Cartao, Conta]:
    cartao = cartao_visivel(db, ctx, cartao_id)
    return cartao, db.get(Conta, cartao.conta_id)


def listar(db: Session, ctx: Contexto, arquivadas: bool) -> CartoesSaida:
    ganchos.antes_de_ler_periodo(db, ctx, fim_do_mes(hoje()))
    linhas = db.execute(
        select(Cartao, Conta)
        .join(Conta, Conta.id == Cartao.conta_id)
        .where(filtro_contas(ctx), Conta.arquivado == arquivadas)
        .order_by(Cartao.id)
    ).all()
    cartoes = _montar(db, linhas)
    if arquivadas:
        total_disponivel = total_faturas = None
    else:
        total_disponivel = para_str(
            sum((Decimal(c.limite_disponivel) for c in cartoes), Decimal("0.00"))
        )
        total_faturas = para_str(
            sum((Decimal(c.fatura_corrente.valor) for c in cartoes), Decimal("0.00"))
        )
    return CartoesSaida(
        cartoes=cartoes,
        limite_disponivel_total=total_disponivel,
        total_faturas_mes=total_faturas,
    )


def obter(db: Session, ctx: Contexto, cartao_id: int) -> CartaoSaida:
    return _montar(db, [_cartao_e_conta(db, ctx, cartao_id)])[0]


def criar(db: Session, ctx: Contexto, dados: CartaoEntrada) -> CartaoSaida:
    conta = db.scalar(select(Conta).where(Conta.id == dados.conta_id, filtro_contas(ctx)))
    if conta is None:
        raise AppError(
            422,
            VALIDACAO,
            "Dados do cartão inválidos.",
            campos={"conta_id": "Conta não encontrada."},
        )
    if conta.arquivado:
        raise AppError(409, CONTA_ARQUIVADA, "Conta arquivada: só é possível desarquivá-la.")
    cartao = Cartao(
        conta_id=conta.id,
        nome=dados.nome,
        limite=dados.limite,
        dia_fechamento=dados.dia_fechamento,
        dia_vencimento=dados.dia_vencimento,
        bandeira=dados.bandeira,
    )
    db.add(cartao)
    db.commit()
    return _montar(db, [(cartao, conta)])[0]


def editar(db: Session, ctx: Contexto, cartao_id: int, dados: CartaoEdicao) -> CartaoSaida:
    cartao, conta = _cartao_e_conta(db, ctx, cartao_id)
    if conta.arquivado:
        raise AppError(409, CONTA_ARQUIVADA, "Conta arquivada: só é possível desarquivá-la.")
    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(cartao, campo, valor)
    db.commit()
    return _montar(db, [(cartao, conta)])[0]


def excluir(db: Session, ctx: Contexto, cartao_id: int) -> None:
    cartao, conta = _cartao_e_conta(db, ctx, cartao_id)
    if conta.arquivado:
        raise AppError(409, CONTA_ARQUIVADA, "Conta arquivada: só é possível desarquivá-la.")
    ids_faturas = select(Fatura.id).where(Fatura.cartao_id == cartao.id)
    tem_compras = (
        db.scalar(select(exists().where(ItemFatura.fatura_id.in_(ids_faturas))))
        or db.scalar(select(exists().where(SerieCartao.cartao_id == cartao.id)))
        or db.scalar(select(exists().where(Lancamento.fatura_id.in_(ids_faturas))))
    )
    if tem_compras:
        raise AppError(
            409,
            CARTAO_COM_COMPRAS,
            "Cartão com compras ou pagamentos: não pode ser excluído.",
        )
    db.execute(delete(Fatura).where(Fatura.cartao_id == cartao.id))
    db.delete(cartao)
    db.commit()
