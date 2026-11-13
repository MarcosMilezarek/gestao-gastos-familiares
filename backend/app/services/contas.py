from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.acesso import Contexto, conta_visivel, filtro_contas
from app.errors import (
    CONTA_ARQUIVADA,
    CONTA_DE_CASAL_ENCERRADO,
    NAO_ENCONTRADO,
    VALIDACAO,
    AppError,
)
from app.models.casal import Casal
from app.models.conta import Conta
from app.models.lancamento import Lancamento
from app.money import para_str
from app.schemas.conta import ContaEdicaoEntrada, ContaSaida, ContasSaida, ReajusteSaida
from app.services import ganchos
from app.services.lancamentos import montar_saidas
from app.services.saldos import saldos_atuais, saldos_previstos
from app.tempo import fim_do_mes, formatar_mes, hoje, mes_ref


def _saldos(db: Session, conta_ids: list[int], mes: date) -> tuple[dict, dict]:
    return saldos_atuais(db, conta_ids), saldos_previstos(db, conta_ids, fim_do_mes(mes))


def _montar_saida(
    conta: Conta, encerrado_em: datetime | None, atual: Decimal, previsto: Decimal
) -> ContaSaida:
    return ContaSaida(
        id=conta.id,
        nome=conta.nome,
        instituicao=conta.instituicao,
        tipo=conta.tipo,
        cor=conta.cor,
        saldo_inicial=para_str(conta.saldo_inicial),
        dono_usuario_id=conta.usuario_id,
        arquivado=bool(conta.arquivado),
        casal_encerrado=encerrado_em is not None,
        saldo_atual=para_str(atual),
        saldo_previsto=para_str(previsto),
    )


def _encerrado_em(db: Session, conta: Conta) -> datetime | None:
    if conta.casal_id is None:
        return None
    return db.scalar(select(Casal.encerrado_em).where(Casal.id == conta.casal_id))


def _saida(db: Session, conta: Conta, mes: date) -> ContaSaida:
    atuais, previstos = _saldos(db, [conta.id], mes)
    return _montar_saida(
        conta, _encerrado_em(db, conta), atuais[conta.id], previstos[conta.id]
    )


def listar(db: Session, ctx: Contexto, mes: date, arquivadas: bool) -> ContasSaida:
    ganchos.antes_de_ler_periodo(db, ctx, fim_do_mes(mes))
    linhas = db.execute(
        select(Conta, Casal.encerrado_em)
        .outerjoin(Casal, Casal.id == Conta.casal_id)
        .where(filtro_contas(ctx), Conta.arquivado == arquivadas)
        .order_by(Conta.id)
    ).all()
    ids = [conta.id for conta, _ in linhas]
    atuais, previstos = _saldos(db, ids, mes)
    contas = [
        _montar_saida(conta, encerrado_em, atuais[conta.id], previstos[conta.id])
        for conta, encerrado_em in linhas
    ]
    if arquivadas:
        total_atual = total_previsto = None
    else:
        total_atual = para_str(sum(atuais.values(), Decimal("0.00")))
        total_previsto = para_str(sum(previstos.values(), Decimal("0.00")))
    return ContasSaida(
        mes=formatar_mes(mes),
        contas=contas,
        total_saldo_atual=total_atual,
        total_saldo_previsto=total_previsto,
    )


def obter(db: Session, ctx: Contexto, conta_id: int, mes: date) -> ContaSaida:
    conta = conta_visivel(db, ctx, conta_id)
    return _saida(db, conta, mes)


def editar(db: Session, ctx: Contexto, conta_id: int, dados: ContaEdicaoEntrada) -> ContaSaida:
    conta = conta_visivel(db, ctx, conta_id)
    if conta.arquivado:
        raise AppError(409, CONTA_ARQUIVADA, "Conta arquivada: só é possível desarquivá-la.")
    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(conta, campo, valor)
    db.commit()
    return _saida(db, conta, mes_ref(hoje()))


def arquivar(db: Session, ctx: Contexto, conta_id: int) -> ContaSaida:
    conta = conta_visivel(db, ctx, conta_id)
    conta.arquivado = True
    ganchos.ao_arquivar_conta(db, conta)
    db.commit()
    return _saida(db, conta, mes_ref(hoje()))


def desarquivar(db: Session, ctx: Contexto, conta_id: int) -> ContaSaida:
    conta = conta_visivel(db, ctx, conta_id)
    if _encerrado_em(db, conta) is not None:
        raise AppError(
            409,
            CONTA_DE_CASAL_ENCERRADO,
            "A conta conjunta de um casal desfeito não pode ser reativada.",
        )
    conta.arquivado = False
    db.commit()
    return _saida(db, conta, mes_ref(hoje()))


def reajustar(db: Session, ctx: Contexto, conta_id: int, saldo_real: Decimal) -> ReajusteSaida:
    # Trava a linha da conta antes de ler o saldo (duas escritas simultâneas ficam em fila).
    conta = db.scalar(
        select(Conta).where(Conta.id == conta_id, filtro_contas(ctx)).with_for_update()
    )
    if conta is None:
        raise AppError(404, NAO_ENCONTRADO, "Conta não encontrada.")
    if conta.arquivado:
        raise AppError(409, CONTA_ARQUIVADA, "Conta arquivada: só é possível desarquivá-la.")

    diferenca = saldo_real - saldos_atuais(db, [conta.id])[conta.id]
    if abs(diferenca) > Decimal("9999999999.99"):
        msg = "Saldo real fora do limite permitido."
        raise AppError(422, VALIDACAO, msg, campos={"saldo_real": msg})
    novo = None
    if diferenca != 0:
        novo = Lancamento(
            tipo="reajuste",
            valor=diferenca,
            data=hoje(),
            situacao="confirmada",
            descricao="Reajuste de saldo",
            conta_id=conta.id,
            criado_por_id=ctx.usuario_id,
        )
        db.add(novo)
    db.commit()
    return ReajusteSaida(
        conta=_saida(db, conta, mes_ref(hoje())),
        lancamento=montar_saidas(db, [novo])[0] if novo is not None else None,
    )
