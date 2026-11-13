from datetime import date
from decimal import Decimal

from sqlalchemy import and_, delete, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.acesso import Contexto, filtro_contas
from app.models.casal import Casal
from app.models.conta import Conta
from app.models.lancamento import Lancamento, LancamentoTag
from app.models.recorrencia import Recorrencia, RecorrenciaTag
from app.tempo import fim_do_mes, hoje, mes_ref, somar_meses


def data_ocorrencia(mes_inicial: date, dia: int, k: int) -> date:
    mes = somar_meses(mes_inicial, k - 1)
    return mes.replace(day=min(dia, fim_do_mes(mes).day))


def criar_recorrencia(
    db: Session,
    *,
    tipo: str,
    valor: Decimal,
    data: date,
    descricao: str | None,
    conta_id: int,
    conta_destino_id: int | None,
    categoria_id: int | None,
    dono_usuario_id: int | None,
    observacao: str | None,
    criado_por_id: int,
    tag_ids: list[int],
    numero_final: int | None,
) -> Lancamento:
    rec = Recorrencia(
        tipo=tipo,
        valor=valor,
        descricao=descricao,
        conta_id=conta_id,
        conta_destino_id=conta_destino_id,
        categoria_id=categoria_id,
        dono_usuario_id=dono_usuario_id,
        observacao=observacao,
        criado_por_id=criado_por_id,
        mes_inicial=mes_ref(data),
        dia=data.day,
        numero_final=numero_final,
        gerado_ate=0,
    )
    db.add(rec)
    db.flush()
    db.add_all([RecorrenciaTag(recorrencia_id=rec.id, tag_id=tag_id) for tag_id in tag_ids])
    db.flush()
    gerar(db, rec, ate=max(data, fim_do_mes(hoje())))
    return db.scalar(
        select(Lancamento).where(
            Lancamento.recorrencia_id == rec.id, Lancamento.numero_recorrencia == 1
        )
    )


def gerar(db: Session, rec: Recorrencia, ate: date) -> None:
    alvo = _alvo(rec, ate)
    if alvo <= rec.gerado_ate:
        return
    tag_ids = db.scalars(
        select(RecorrenciaTag.tag_id).where(RecorrenciaTag.recorrencia_id == rec.id)
    ).all()
    for k in range(rec.gerado_ate + 1, alvo + 1):
        ocorrencia = Lancamento(
            tipo=rec.tipo,
            valor=rec.valor,
            data=data_ocorrencia(rec.mes_inicial, rec.dia, k),
            situacao="prevista",
            descricao=rec.descricao,
            conta_id=rec.conta_id,
            conta_destino_id=rec.conta_destino_id,
            categoria_id=rec.categoria_id,
            dono_usuario_id=rec.dono_usuario_id,
            observacao=rec.observacao,
            criado_por_id=rec.criado_por_id,
            recorrencia_id=rec.id,
            numero_recorrencia=k,
        )
        try:
            with db.begin_nested():
                db.add(ocorrencia)
                db.flush()
        except IntegrityError as erro:
            if "uq_lancamento_recorrencia_id_numero_recorrencia" not in str(erro.orig):
                raise
            continue
        db.add_all(
            [LancamentoTag(lancamento_id=ocorrencia.id, tag_id=tag_id) for tag_id in tag_ids]
        )
    rec.gerado_ate = alvo


def garantir_ate(db: Session, ctx: Contexto, ate: date) -> None:
    contas = select(Conta.id).where(filtro_contas(ctx), Conta.arquivado == 0)
    candidatas = db.scalars(
        select(Recorrencia)
        .where(
            Recorrencia.conta_id.in_(contas),
            or_(
                Recorrencia.conta_destino_id.is_(None),
                Recorrencia.conta_destino_id.in_(contas),
            ),
            or_(
                Recorrencia.numero_final.is_(None),
                Recorrencia.gerado_ate < Recorrencia.numero_final,
            ),
        )
        .order_by(Recorrencia.id)
    ).all()
    # Dados simples só: o commit do laço expira os objetos ORM.
    pendentes = []
    for rec in candidatas:
        if _alvo(rec, ate) > rec.gerado_ate:
            pontas = [id_ for id_ in (rec.conta_id, rec.conta_destino_id) if id_ is not None]
            pendentes.append((rec.id, pontas))
    # solta as travas a cada candidata (evita segurar S de conta até o fim da requisição)
    for rec_id, pontas in pendentes:
        # Ordem de travas (D-046): conta antes de recorrência, como o arquivar.
        pontas_travadas = db.scalars(
            select(Conta)
            .where(Conta.id.in_(pontas))
            .order_by(Conta.id)
            .with_for_update(read=True)
            .execution_options(populate_existing=True)
        ).all()
        if any(conta.arquivado for conta in pontas_travadas):
            db.commit()
            continue
        travada = db.scalar(
            select(Recorrencia)
            .where(Recorrencia.id == rec_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if travada is None:
            db.commit()
            continue
        # A edição pode ter trocado as contas entre a leitura e a trava: pula esta candidata.
        atuais = {id_ for id_ in (travada.conta_id, travada.conta_destino_id) if id_ is not None}
        if atuais != set(pontas):
            db.commit()
            continue
        gerar(db, travada, ate)
        db.commit()


def _alvo(rec: Recorrencia, ate: date) -> int:
    k = (ate.year - rec.mes_inicial.year) * 12 + ate.month - rec.mes_inicial.month + 1
    if data_ocorrencia(rec.mes_inicial, rec.dia, k) > ate:
        k -= 1
    if rec.numero_final is not None:
        k = min(k, rec.numero_final)
    return k


def apagar_previstas_da_conta(db: Session, conta: Conta) -> None:
    """Conta arquivada (§4.4): apaga as previstas futuras das recorrências com a conta em qualquer ponta. Sem commit."""
    recorrencias = db.scalars(
        select(Recorrencia).where(
            or_(Recorrencia.conta_id == conta.id, Recorrencia.conta_destino_id == conta.id)
        )
    ).all()
    for rec in recorrencias:
        apagadas = db.execute(
            select(Lancamento.id, Lancamento.numero_recorrencia).where(
                Lancamento.recorrencia_id == rec.id,
                Lancamento.situacao == "prevista",
                Lancamento.data >= hoje(),
            )
        ).all()
        if not apagadas:
            continue
        _apagar_lancamentos(db, [id_ for id_, _ in apagadas])
        rec.gerado_ate = min(numero for _, numero in apagadas) - 1


def encerrar_entre_individuais(db: Session, casal: Casal) -> None:
    """Desvínculo (§4.8, regra 4 de comum.md §7.3): encerra as recorrências e apaga as transferências previstas entre as individuais. Sem commit."""
    a = _conta_individual(db, casal.pessoa_a_id)
    b = _conta_individual(db, casal.pessoa_b_id)
    recorrencias = db.scalars(
        select(Recorrencia).where(
            or_(
                and_(Recorrencia.conta_id == a, Recorrencia.conta_destino_id == b),
                and_(Recorrencia.conta_id == b, Recorrencia.conta_destino_id == a),
            )
        )
    ).all()
    for rec in recorrencias:
        previstas = db.scalars(
            select(Lancamento.id).where(
                Lancamento.recorrencia_id == rec.id, Lancamento.situacao == "prevista"
            )
        ).all()
        _apagar_lancamentos(db, previstas)
        # A última gerada vira a final; se já havia final menor, ela prevalece.
        rec.numero_final = (
            rec.gerado_ate
            if rec.numero_final is None
            else min(rec.numero_final, rec.gerado_ate)
        )
        restante = db.scalar(select(Lancamento.id).where(Lancamento.recorrencia_id == rec.id).limit(1))
        if restante is None:
            db.execute(delete(RecorrenciaTag).where(RecorrenciaTag.recorrencia_id == rec.id))
            db.delete(rec)
    avulsas = db.scalars(
        select(Lancamento.id).where(
            Lancamento.tipo == "transferencia",
            Lancamento.situacao == "prevista",
            Lancamento.recorrencia_id.is_(None),
            or_(
                and_(Lancamento.conta_id == a, Lancamento.conta_destino_id == b),
                and_(Lancamento.conta_id == b, Lancamento.conta_destino_id == a),
            ),
        )
    ).all()
    _apagar_lancamentos(db, avulsas)


def _conta_individual(db: Session, pessoa_id: int) -> int:
    return db.scalars(select(Conta.id).where(Conta.usuario_id == pessoa_id)).one()


def _apagar_lancamentos(db: Session, ids: list[int]) -> None:
    db.execute(
        delete(LancamentoTag)
        .where(LancamentoTag.lancamento_id.in_(ids))
        .execution_options(synchronize_session=False)
    )
    db.execute(
        delete(Lancamento).where(Lancamento.id.in_(ids)).execution_options(synchronize_session=False)
    )
