from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.acesso import Contexto, contexto_do_usuario
from app.errors import (
    CONVIDADO_JA_VINCULADO,
    CONVIDADO_NAO_CADASTRADO,
    CONVITE_NAO_PENDENTE,
    CONVITE_PARA_SI_MESMO,
    CONVITE_PENDENTE_EXISTE,
    ERRO_INTERNO,
    JA_VINCULADO,
    NAO_ENCONTRADO,
    SEM_VINCULO,
    VALIDACAO,
    AppError,
)
from app.models.casal import Casal, Convite
from app.models.usuario import Usuario
from app.services import ganchos
from app.tempo import agora_utc

_TENTATIVAS_ACEITE = 3


def estado_do_vinculo(db: Session, ctx: Contexto) -> dict:
    recebidos = db.execute(
        select(Convite.id, Usuario.nome)
        .join(Usuario, Usuario.id == Convite.convidante_id)
        .where(Convite.convidado_id == ctx.usuario_id, Convite.estado == "pendente")
        .order_by(Convite.id)
    ).all()
    enviado = db.execute(
        select(Convite.id, Usuario.email)
        .join(Usuario, Usuario.id == Convite.convidado_id)
        .where(Convite.convidante_id == ctx.usuario_id, Convite.estado == "pendente")
    ).first()

    parceiro = None
    if ctx.casal_ativo_id is not None:
        estado = "vinculado"
        parceiro = db.get(Usuario, ctx.parceiro_id)
    elif recebidos:
        estado = "convite_recebido"
    elif enviado is not None:
        estado = "convite_enviado"
    else:
        estado = "sem_vinculo"

    return {
        "estado": estado,
        "convite_enviado": (
            {"id": enviado.id, "email_convidado": enviado.email} if enviado is not None else None
        ),
        "convites_recebidos": [
            {"id": convite_id, "convidante_nome": nome} for convite_id, nome in recebidos
        ],
        "parceiro": {"id": parceiro.id, "nome": parceiro.nome} if parceiro is not None else None,
    }


def convidar(db: Session, ctx: Contexto, email: str) -> Convite:
    # Leitura simples do convidado antes das travas: o id dele é preciso para travar o par.
    convidado = db.scalar(select(Usuario).where(Usuario.email == email))
    pessoas = [ctx.usuario_id]
    if convidado is not None and convidado.id != ctx.usuario_id:
        pessoas.append(convidado.id)
    # Trava as duas pessoas do par: convites simultâneos delas ficam em fila.
    _travar_usuarios(db, pessoas)

    if _tem_casal_ativo(db, ctx.usuario_id):
        raise AppError(409, JA_VINCULADO, "Você já está vinculado a um casal.")

    if convidado is not None and convidado.id == ctx.usuario_id:
        raise AppError(409, CONVITE_PARA_SI_MESMO, "Você não pode convidar a si mesmo.")
    if convidado is None:
        raise AppError(
            409,
            CONVIDADO_NAO_CADASTRADO,
            "Não há conta com este e-mail. A pessoa precisa se cadastrar antes.",
        )
    if contexto_do_usuario(db, convidado.id).casal_ativo_id is not None:
        raise AppError(409, CONVIDADO_JA_VINCULADO, "Esta pessoa já está vinculada a um casal.")

    pendente = db.scalar(
        select(Convite.id).where(
            Convite.convidante_id == ctx.usuario_id, Convite.estado == "pendente"
        )
    )
    if pendente is not None:
        raise AppError(
            409,
            CONVITE_PENDENTE_EXISTE,
            "Você já tem um convite pendente. Cancele-o antes de convidar outra pessoa.",
        )

    convite = Convite(convidante_id=ctx.usuario_id, convidado_id=convidado.id, estado="pendente")
    db.add(convite)
    try:
        db.flush()
    except IntegrityError as erro:
        db.rollback()
        if "uq_convite_pendente_chave" not in str(erro.orig):
            raise
        raise AppError(
            409,
            CONVITE_PENDENTE_EXISTE,
            "Você já tem um convite pendente. Cancele-o antes de convidar outra pessoa.",
        ) from erro
    db.commit()
    return convite


def cancelar_convite(db: Session, ctx: Contexto, convite_id: int) -> Convite:
    convite = db.scalar(
        select(Convite).where(Convite.id == convite_id, Convite.convidante_id == ctx.usuario_id)
    )
    if convite is None:
        raise AppError(404, NAO_ENCONTRADO, "Convite não encontrado.")
    return _responder(db, convite, "cancelado")


def recusar_convite(db: Session, ctx: Contexto, convite_id: int) -> Convite:
    convite = db.scalar(
        select(Convite).where(Convite.id == convite_id, Convite.convidado_id == ctx.usuario_id)
    )
    if convite is None:
        raise AppError(404, NAO_ENCONTRADO, "Convite não encontrado.")
    return _responder(db, convite, "recusado")


def _responder(db: Session, convite: Convite, estado: str) -> Convite:
    # Ordem global: usuario -> convite -> casal. Antes de travar o convite, travar as duas pessoas.
    _travar_usuarios(db, [convite.convidante_id, convite.convidado_id])
    # Leitura travada: um aceite concorrente já confirmou o que fez antes de liberar as travas.
    convite = db.scalar(
        select(Convite)
        .where(Convite.id == convite.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if convite.estado != "pendente":
        raise AppError(409, CONVITE_NAO_PENDENTE, "Este convite não está mais pendente.")
    convite.estado = estado
    convite.respondido_em = agora_utc()
    db.commit()
    return convite


def aceitar_convite(db: Session, ctx: Contexto, convite_id: int) -> dict:
    # Descobre todas as pessoas que o aceite toca, trava essas em uma chamada só (ordem crescente)
    # e confere, depois das travas, se o conjunto cresceu. Se cresceu, solta tudo e tenta de novo.
    for _ in range(_TENTATIVAS_ACEITE):
        convite = db.scalar(
            select(Convite).where(Convite.id == convite_id, Convite.convidado_id == ctx.usuario_id)
        )
        if convite is None:
            raise AppError(404, NAO_ENCONTRADO, "Convite não encontrado.")

        par = {convite.convidante_id, convite.convidado_id}
        alvo = par | _pontas_pendentes(db, par)
        # Terceiros entram na mesma chamada que o par: travá-los depois do par quebra a ordem.
        _travar_usuarios(db, list(alvo))
        if _pontas_pendentes(db, par) <= alvo:
            break
        # Apareceu gente nova no conjunto depois da leitura: o rollback solta as travas.
        db.rollback()
    else:
        raise AppError(500, ERRO_INTERNO, "Não foi possível concluir agora. Tente novamente.")

    # Leitura travada: a transação concorrente já confirmou o que fez antes de liberar as travas.
    convite = db.scalar(
        select(Convite)
        .where(Convite.id == convite_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if convite.estado != "pendente":
        raise AppError(409, CONVITE_NAO_PENDENTE, "Este convite não está mais pendente.")
    if _tem_casal_ativo(db, convite.convidado_id):
        raise AppError(409, JA_VINCULADO, "Você já está vinculado a um casal.")
    if _tem_casal_ativo(db, convite.convidante_id):
        raise AppError(
            409,
            CONVIDADO_JA_VINCULADO,
            "Quem convidou já está vinculado a outro casal. Este convite não vale mais.",
        )

    casal = Casal(pessoa_a_id=convite.convidante_id, pessoa_b_id=convite.convidado_id)
    db.add(casal)
    convite.estado = "aceito"
    convite.respondido_em = agora_utc()
    db.flush()
    pessoas = [convite.convidante_id, convite.convidado_id]
    db.execute(
        update(Convite)
        .where(
            Convite.estado == "pendente",
            or_(Convite.convidante_id.in_(pessoas), Convite.convidado_id.in_(pessoas)),
        )
        .values(estado="invalidado", respondido_em=agora_utc())
    )
    ganchos.ao_vincular(db, casal)
    db.commit()
    return estado_do_vinculo(db, contexto_do_usuario(db, ctx.usuario_id))


def desvincular(db: Session, ctx: Contexto, confirmar: bool) -> dict:
    if not confirmar:
        raise AppError(
            422,
            VALIDACAO,
            "Confirme a desvinculação para continuar.",
            campos={"confirmar": "Confirme a desvinculação."},
        )
    if ctx.casal_ativo_id is None:
        raise AppError(409, SEM_VINCULO, "Você não está vinculado a um casal.")

    # O par de um casal não muda: travar as duas pessoas do contexto basta.
    _travar_usuarios(db, [ctx.usuario_id, ctx.parceiro_id])
    casal = db.scalar(
        select(Casal)
        .where(Casal.id == ctx.casal_ativo_id, Casal.encerrado_em.is_(None))
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if casal is None:
        raise AppError(409, SEM_VINCULO, "Você não está vinculado a um casal.")

    casal.encerrado_em = agora_utc()
    ganchos.ao_desvincular(db, casal)
    db.commit()
    return estado_do_vinculo(db, contexto_do_usuario(db, ctx.usuario_id))


def _travar_usuarios(db: Session, usuarios_ids: list[int]) -> None:
    # Trava em ordem crescente de id: duas operações sobre o mesmo par não se bloqueiam em ciclo.
    for usuario_id in sorted(set(usuarios_ids)):
        db.execute(select(Usuario.id).where(Usuario.id == usuario_id).with_for_update())


def _pontas_pendentes(db: Session, pessoas: set[int]) -> set[int]:
    # Leitura sem trava: só descobre quem travar. A conferência acontece depois das travas.
    ids = list(pessoas)
    linhas = db.execute(
        select(Convite.convidante_id, Convite.convidado_id).where(
            Convite.estado == "pendente",
            or_(Convite.convidante_id.in_(ids), Convite.convidado_id.in_(ids)),
        )
    ).all()
    return {ponta for linha in linhas for ponta in linha}


def _tem_casal_ativo(db: Session, usuario_id: int) -> bool:
    # Leitura travada, para não usar um retrato antigo da transação.
    casal_id = db.scalar(
        select(Casal.id)
        .where(
            or_(Casal.pessoa_a_id == usuario_id, Casal.pessoa_b_id == usuario_id),
            Casal.encerrado_em.is_(None),
        )
        .with_for_update()
    )
    return casal_id is not None
