from dataclasses import replace

from sqlalchemy import and_, delete, or_, select
from sqlalchemy.orm import Session

from app.acesso import Contexto, filtro_contas
from app.errors import LANCAMENTO_SOMENTE_LEITURA, NAO_ENCONTRADO, AppError
from app.models.conta import Conta
from app.models.lancamento import Lancamento, LancamentoTag
from app.models.recorrencia import Recorrencia, RecorrenciaTag
from app.schemas.lancamento import Alcance, LancamentoEdicaoEntrada, LancamentoSaida
from app.services import lancamentos
from app.services.recorrencias import data_ocorrencia

# Campos copiados tal como enviados; data (vira dia) e tags têm tratamento próprio.
_CAMPOS = (
    "valor",
    "descricao",
    "observacao",
    "conta_id",
    "conta_destino_id",
    "categoria_id",
    "dono_usuario_id",
)

# Campos de conta e dono: a combinação deles é o que a validação examina por ocorrência.
_CAMPOS_DE_CONTA = ("conta_id", "conta_destino_id", "dono_usuario_id")


def _condicoes_do_conjunto(r: Recorrencia, n: int, alcance: Alcance) -> list:
    """Ocorrências do alcance: a `n` e, em `este_e_pendentes`, as pendentes a partir dela (§4.5)."""
    condicoes = [Lancamento.recorrencia_id == r.id]
    if alcance == "este_e_pendentes":
        condicoes.append(
            or_(
                Lancamento.numero_recorrencia == n,
                and_(Lancamento.numero_recorrencia > n, Lancamento.situacao == "prevista"),
            )
        )
    return condicoes


def _conferir_visiveis(
    db: Session, ctx: Contexto, r: Recorrencia, ocorrencias: list[Lancamento]
) -> None:
    """Recusa se alguma conta do modelo ou de uma ocorrência não é visível (§7.3 regra 2)."""
    pontas = {r.conta_id, r.conta_destino_id}
    for ocorrencia in ocorrencias:
        pontas |= {ocorrencia.conta_id, ocorrencia.conta_destino_id}
    pontas.discard(None)
    visiveis = set(db.scalars(select(Conta.id).where(Conta.id.in_(pontas), filtro_contas(ctx))))
    if visiveis != pontas:
        raise AppError(
            409,
            LANCAMENTO_SOMENTE_LEITURA,
            "Lançamento somente leitura: uma das contas não é sua.",
        )


def editar_conjunto(
    db: Session,
    ctx: Contexto,
    atual: Lancamento,
    entrada: LancamentoEdicaoEntrada,
    alcance: Alcance,
) -> LancamentoSaida:
    """Edita as ocorrências do alcance múltiplo e o modelo; uma transação. Chamado por `lancamentos.editar`."""
    enviados = entrada.model_fields_set
    if "situacao" in enviados:
        raise lancamentos.invalido("situacao", "Confirmar é uma ocorrência por vez.")

    n = atual.numero_recorrencia
    # Trava o modelo: a edição do conjunto e as gerações não podem correr ao mesmo tempo.
    r = db.scalar(
        select(Recorrencia)
        .where(Recorrencia.id == atual.recorrencia_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if r is None:
        raise AppError(404, NAO_ENCONTRADO, "Lançamento não encontrado.")
    if "data" in enviados:
        nominal = data_ocorrencia(r.mes_inicial, r.dia, n)
        if (entrada.data.year, entrada.data.month) != (nominal.year, nominal.month):
            raise lancamentos.invalido("data", "A data deve ficar no mês da ocorrência.")

    ocorrencias = db.scalars(
        select(Lancamento)
        .where(*_condicoes_do_conjunto(r, n, alcance))
        .execution_options(populate_existing=True)
    ).all()
    _conferir_visiveis(db, ctx, r, ocorrencias)

    def valor_de(campo: str, origem=r):
        return getattr(entrada if campo in enviados else origem, campo)

    tag_ids = (
        entrada.tag_ids
        if "tag_ids" in enviados
        else list(
            db.scalars(
                select(RecorrenciaTag.tag_id).where(RecorrenciaTag.recorrencia_id == r.id)
            )
        )
    )
    estado = lancamentos.Estado(
        tipo=r.tipo,
        conta_id=valor_de("conta_id"),
        valor=valor_de("valor"),
        data=entrada.data if "data" in enviados else atual.data,
        situacao=atual.situacao,
        conta_destino_id=valor_de("conta_destino_id"),
        categoria_id=valor_de("categoria_id"),
        dono_usuario_id=valor_de("dono_usuario_id"),
        descricao=valor_de("descricao"),
        observacao=valor_de("observacao"),
        tag_ids=tag_ids,
    )
    lancamentos.validar(db, ctx, estado, r)
    # Ocorrências podem ter contas diferentes do modelo ("somente este"): cada combinação vale.
    combinacao_do_modelo = tuple(valor_de(campo) for campo in _CAMPOS_DE_CONTA)
    combinacoes = dict.fromkeys(
        tuple(valor_de(campo, ocorrencia) for campo in _CAMPOS_DE_CONTA)
        for ocorrencia in ocorrencias
    )
    for combinacao in combinacoes:
        if combinacao != combinacao_do_modelo:
            lancamentos.validar(
                db, ctx, replace(estado, **dict(zip(_CAMPOS_DE_CONTA, combinacao))), r
            )

    campos = [campo for campo in _CAMPOS if campo in enviados]
    if "data" in enviados:
        r.dia = entrada.data.day
    for campo in campos:
        setattr(r, campo, getattr(entrada, campo))
    if "tag_ids" in enviados:
        db.execute(delete(RecorrenciaTag).where(RecorrenciaTag.recorrencia_id == r.id))
        db.add_all(RecorrenciaTag(recorrencia_id=r.id, tag_id=tag_id) for tag_id in entrada.tag_ids)

    for ocorrencia in ocorrencias:
        for campo in campos:
            setattr(ocorrencia, campo, getattr(entrada, campo))
        if "data" in enviados:
            ocorrencia.data = data_ocorrencia(r.mes_inicial, r.dia, ocorrencia.numero_recorrencia)
        if "tag_ids" in enviados:
            lancamentos.substituir_tags(db, ocorrencia.id, entrada.tag_ids)
    db.commit()
    return lancamentos.montar_saidas(db, [atual])[0]


def excluir_conjunto(db: Session, ctx: Contexto, atual: Lancamento, alcance: Alcance) -> None:
    """Exclui as ocorrências do alcance múltiplo; uma transação. Chamado por `lancamentos.excluir`.

    `atual` não pode ser lido depois do commit: a sessão já não o mantém.
    """
    n = atual.numero_recorrencia
    # Trava o modelo: a exclusão do conjunto e as gerações não podem correr ao mesmo tempo.
    r = db.scalar(
        select(Recorrencia)
        .where(Recorrencia.id == atual.recorrencia_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if r is None:
        raise AppError(404, NAO_ENCONTRADO, "Lançamento não encontrado.")

    ocorrencias = db.scalars(
        select(Lancamento)
        .where(*_condicoes_do_conjunto(r, n, alcance))
        .execution_options(populate_existing=True)
    ).all()
    _conferir_visiveis(db, ctx, r, ocorrencias)
    if alcance == "este_e_pendentes":
        # Encerra na anterior à `n`: nenhuma ocorrência posterior é gerada (RF-3.06).
        r.numero_final = n - 1
    ids = [ocorrencia.id for ocorrencia in ocorrencias]

    # Ordem por causa das FK RESTRICT: tags do lançamento, lançamento, tags do modelo, modelo.
    db.execute(delete(LancamentoTag).where(LancamentoTag.lancamento_id.in_(ids)))
    db.execute(delete(Lancamento).where(Lancamento.id.in_(ids)))
    sobrou = db.scalar(select(Lancamento.id).where(Lancamento.recorrencia_id == r.id).limit(1))
    if sobrou is None:
        db.execute(delete(RecorrenciaTag).where(RecorrenciaTag.recorrencia_id == r.id))
        db.delete(r)
    db.commit()
