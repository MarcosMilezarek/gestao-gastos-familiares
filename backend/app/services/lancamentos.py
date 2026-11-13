from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import TypeVar

from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session, aliased

from app.acesso import (
    Contexto,
    categoria_visivel,
    conta_visivel,
    filtro_lancamentos,
    lancamento_gravavel,
    lancamento_visivel,
    tag_visivel,
)
from app.errors import (
    CATEGORIA_ARQUIVADA,
    CATEGORIA_TIPO_INVALIDO,
    CONTA_ARQUIVADA,
    DONO_CONTA_INCOMPATIVEL,
    LANCAMENTO_JA_CONFIRMADO,
    LANCAMENTO_NAO_EDITAVEL,
    VALIDACAO,
    AppError,
)
from app.models.categoria import Categoria, Tag
from app.models.conta import Conta
from app.models.lancamento import Lancamento, LancamentoTag
from app.models.meta import Meta
from app.models.recorrencia import Recorrencia
from app.models.usuario import Usuario
from app.money import para_str
from app.schemas.lancamento import (
    Alcance,
    CategoriaRefSaida,
    LancamentoEdicaoEntrada,
    LancamentoEntrada,
    LancamentoSaida,
    MetaRefSaida,
    PessoaRefSaida,
    TagSaida,
)
from app.services import ganchos, recorrencias
from app.services.saldos import eh_aporte, situacao_exibida
from app.tempo import fim_do_mes, hoje, somar_meses


def montar_saidas(db: Session, lancamentos: list[Lancamento]) -> list[LancamentoSaida]:
    if not lancamentos:
        return []
    ids = [lancamento.id for lancamento in lancamentos]
    contas_ids = {lancamento.conta_id for lancamento in lancamentos}
    contas_ids |= {
        lancamento.conta_destino_id
        for lancamento in lancamentos
        if lancamento.conta_destino_id is not None
    }
    categorias_ids = {
        lancamento.categoria_id
        for lancamento in lancamentos
        if lancamento.categoria_id is not None
    }
    criadores_ids = {lancamento.criado_por_id for lancamento in lancamentos}

    contas = {c.id: c for c in db.scalars(select(Conta).where(Conta.id.in_(contas_ids)))}
    pai = aliased(Categoria)
    categorias = {
        cat.id: (cat, pai_cat)
        for cat, pai_cat in db.execute(
            select(Categoria, pai)
            .outerjoin(pai, pai.id == Categoria.categoria_pai_id)
            .where(Categoria.id.in_(categorias_ids))
        )
    }
    tags: dict[int, list[TagSaida]] = {}
    for lancamento_id, tag_id, tag_nome in db.execute(
        select(LancamentoTag.lancamento_id, Tag.id, Tag.nome)
        .join(Tag, Tag.id == LancamentoTag.tag_id)
        .where(LancamentoTag.lancamento_id.in_(ids))
        .order_by(Tag.id)
    ):
        tags.setdefault(lancamento_id, []).append(TagSaida(id=tag_id, nome=tag_nome))
    criadores = {
        uid: nome
        for uid, nome in db.execute(
            select(Usuario.id, Usuario.nome).where(Usuario.id.in_(criadores_ids))
        )
    }
    recorrencias_ids = {
        lancamento.recorrencia_id
        for lancamento in lancamentos
        if lancamento.recorrencia_id is not None
    }
    total_por_recorrencia = {
        rec_id: numero_final
        for rec_id, numero_final in db.execute(
            select(Recorrencia.id, Recorrencia.numero_final).where(
                Recorrencia.id.in_(recorrencias_ids)
            )
        )
    }

    metas_ids = {
        lancamento.meta_id for lancamento in lancamentos if lancamento.meta_id is not None
    }
    nomes_metas: dict[int, str] = {}
    if metas_ids:
        nomes_metas = dict(
            db.execute(select(Meta.id, Meta.nome).where(Meta.id.in_(metas_ids))).all()
        )

    referencia = hoje()
    saidas = []
    for lancamento in lancamentos:
        origem = contas[lancamento.conta_id]
        destino = contas.get(lancamento.conta_destino_id)
        categoria = None
        if lancamento.categoria_id is not None:
            cat, pai_cat = categorias[lancamento.categoria_id]
            categoria = CategoriaRefSaida(
                id=cat.id,
                nome=cat.nome,
                pai_nome=pai_cat.nome if pai_cat is not None else None,
                cor=pai_cat.cor if pai_cat is not None else cat.cor,
                icone=cat.icone,
            )
        recorrente = lancamento.recorrencia_id is not None
        saidas.append(
            LancamentoSaida(
                id=lancamento.id,
                tipo=lancamento.tipo,
                valor=para_str(lancamento.valor),
                data=lancamento.data,
                situacao=situacao_exibida(lancamento.situacao, lancamento.data, referencia),
                descricao=lancamento.descricao,
                categoria=categoria,
                dono_usuario_id=lancamento.dono_usuario_id,
                conta_id=lancamento.conta_id,
                conta_destino_id=lancamento.conta_destino_id,
                aporte=destino is not None and eh_aporte(lancamento, origem, destino),
                tags=tags.get(lancamento.id, []),
                observacao=lancamento.observacao,
                criado_por=PessoaRefSaida(
                    id=lancamento.criado_por_id,
                    nome=criadores[lancamento.criado_por_id],
                ),
                criado_em=lancamento.criado_em,
                recorrente=recorrente,
                recorrencia_id=lancamento.recorrencia_id,
                numero_recorrencia=lancamento.numero_recorrencia,
                total_ocorrencias=(
                    total_por_recorrencia[lancamento.recorrencia_id] if recorrente else None
                ),
                meta=(
                    None
                    if lancamento.meta_id is None
                    else MetaRefSaida(
                        id=lancamento.meta_id, nome=nomes_metas[lancamento.meta_id]
                    )
                ),
            )
        )
    return saidas


def obter(db: Session, ctx: Contexto, lancamento_id: int) -> LancamentoSaida:
    lancamento = lancamento_visivel(db, ctx, lancamento_id)
    return montar_saidas(db, [lancamento])[0]


def listar_mes(
    db: Session, ctx: Contexto, mes: date, conta_id: int | None = None
) -> list[LancamentoSaida]:
    ganchos.antes_de_ler_periodo(db, ctx, fim_do_mes(mes))
    condicoes = [
        Lancamento.data.between(mes, fim_do_mes(mes)),
        filtro_lancamentos(ctx),
        Lancamento.tipo != "pagamento_fatura",
    ]
    if conta_id is not None:
        conta_visivel(db, ctx, conta_id)
        condicoes.append(
            or_(Lancamento.conta_id == conta_id, Lancamento.conta_destino_id == conta_id)
        )
    lancamentos = db.scalars(
        select(Lancamento)
        .where(*condicoes)
        .order_by(Lancamento.data.desc(), Lancamento.id.desc())
    ).all()
    return montar_saidas(db, list(lancamentos))


_DATA_MINIMA = date(2000, 1, 1)
# Campos gravados em `lancamento` (o tipo nunca muda, então não entra no PATCH).
_CAMPOS_PATCH = (
    "valor",
    "data",
    "situacao",
    "descricao",
    "observacao",
    "conta_id",
    "conta_destino_id",
    "categoria_id",
    "dono_usuario_id",
)
T = TypeVar("T")


@dataclass
class Estado:
    """Estado resultante de um lançamento: é o que a validação examina."""

    tipo: str
    conta_id: int
    valor: Decimal
    data: date
    situacao: str
    conta_destino_id: int | None = None
    categoria_id: int | None = None
    dono_usuario_id: int | None = None
    descricao: str | None = None
    observacao: str | None = None
    tag_ids: list[int] = field(default_factory=list)


def invalido(campo: str, mensagem: str) -> AppError:
    return AppError(422, VALIDACAO, "Dados do lançamento inválidos.", campos={campo: mensagem})


def _achar(
    buscar: Callable[[Session, Contexto, int], T],
    db: Session,
    ctx: Contexto,
    ref_id: int,
    *,
    campo: str,
    mensagem: str,
) -> T:
    # Referência inválida no corpo é 422 genérico (D10), não 404.
    try:
        return buscar(db, ctx, ref_id)
    except AppError:
        raise invalido(campo, mensagem) from None


def _conta_ativa(conta: Conta) -> Conta:
    if conta.arquivado:
        raise AppError(409, CONTA_ARQUIVADA, "Conta arquivada.")
    return conta


def _validar_dono(ctx: Contexto, dono_usuario_id: int | None, conta: Conta) -> None:
    if dono_usuario_id is None:
        valido = ctx.casal_ativo_id is not None and conta.casal_id == ctx.casal_ativo_id
    else:
        valido = (
            dono_usuario_id in (ctx.usuario_id, ctx.parceiro_id)
            and conta.usuario_id == dono_usuario_id
        )
    if not valido:
        raise AppError(
            409,
            DONO_CONTA_INCOMPATIVEL,
            "Dono incompatível com a conta.",
            campos={"conta_id": "Dono incompatível com a conta."},
        )


def validar(db: Session, ctx: Contexto, estado: Estado, atual: Lancamento | None) -> None:
    transferencia = estado.tipo == "transferencia"
    if transferencia and estado.categoria_id is not None:
        raise invalido("categoria_id", "Transferência não tem categoria.")
    if transferencia and estado.dono_usuario_id is not None:
        raise invalido("dono_usuario_id", "Transferência não tem dono.")
    if not transferencia and estado.conta_destino_id is not None:
        raise invalido("conta_destino_id", "Só transferência tem conta de destino.")

    # Passo 1: contas visíveis e não arquivadas.
    origem = _conta_ativa(
        _achar(
            conta_visivel, db, ctx, estado.conta_id, campo="conta_id", mensagem="Conta não encontrada."
        )
    )
    if transferencia:
        _conta_ativa(
            _achar(
                conta_visivel,
                db,
                ctx,
                estado.conta_destino_id,
                campo="conta_destino_id",
                mensagem="Conta não encontrada.",
            )
        )
        if estado.conta_destino_id == estado.conta_id:
            raise invalido("conta_destino_id", "Origem e destino devem ser contas diferentes.")
    else:
        # Passo 2: dono e conta (RG-04), só em despesa e receita.
        _validar_dono(ctx, estado.dono_usuario_id, origem)
        # Passo 3: categoria do mesmo tipo, não arquivada (exceto a que já está no lançamento).
        categoria = _achar(
            categoria_visivel,
            db,
            ctx,
            estado.categoria_id,
            campo="categoria_id",
            mensagem="Categoria não encontrada.",
        )
        if categoria.tipo != estado.tipo:
            raise AppError(409, CATEGORIA_TIPO_INVALIDO, "Categoria de outro tipo.")
        if categoria.arquivado and (atual is None or atual.categoria_id != categoria.id):
            raise AppError(409, CATEGORIA_ARQUIVADA, "Categoria arquivada.")

    # Passo 4: tags visíveis.
    for tag_id in estado.tag_ids:
        _achar(tag_visivel, db, ctx, tag_id, campo="tag_ids", mensagem="Tag não encontrada.")

    # Campos: data no intervalo permitido e descrição obrigatória em despesa e receita.
    if not _DATA_MINIMA <= estado.data <= somar_meses(hoje(), 120):
        raise invalido("data", "Informe uma data entre 2000-01-01 e 10 anos à frente.")
    if not transferencia and not estado.descricao:
        raise invalido("descricao", "Informe a descrição.")


def tag_ids_atuais(db: Session, lancamento_id: int) -> list[int]:
    return list(
        db.scalars(
            select(LancamentoTag.tag_id).where(LancamentoTag.lancamento_id == lancamento_id)
        )
    )


def remover_tags(db: Session, lancamento_id: int) -> None:
    db.execute(delete(LancamentoTag).where(LancamentoTag.lancamento_id == lancamento_id))


def substituir_tags(db: Session, lancamento_id: int, tag_ids: list[int]) -> None:
    remover_tags(db, lancamento_id)
    db.add_all(LancamentoTag(lancamento_id=lancamento_id, tag_id=tag_id) for tag_id in tag_ids)


def _aplicar(lancamento: Lancamento, estado: Estado) -> None:
    lancamento.tipo = estado.tipo
    for campo in _CAMPOS_PATCH:
        setattr(lancamento, campo, getattr(estado, campo))


def _contas_ativas(db: Session, lancamento: Lancamento) -> None:
    pontas = {lancamento.conta_id, lancamento.conta_destino_id} - {None}
    for conta in db.scalars(select(Conta).where(Conta.id.in_(pontas))):
        _conta_ativa(conta)


def _criar_recorrencia(
    db: Session, ctx: Contexto, dados: dict, recorrencia: dict
) -> LancamentoSaida:
    if dados["situacao"] not in (None, "prevista"):
        raise invalido("situacao", "Lançamento recorrente nasce prevista.")
    if recorrencia["modo"] == "n_meses":
        meses = recorrencia["meses"]
        if meses is None or not 2 <= meses <= 60:
            raise invalido("recorrencia", "Repita de 2 a 60 meses.")
        numero_final = meses
    else:
        numero_final = None
    if dados["data"] < somar_meses(hoje(), -60):
        raise invalido("data", "A primeira ocorrência não pode ser anterior a 60 meses.")

    dados["situacao"] = "prevista"
    estado = Estado(**dados)
    validar(db, ctx, estado, None)
    primeira = recorrencias.criar_recorrencia(
        db,
        tipo=estado.tipo,
        valor=estado.valor,
        data=estado.data,
        descricao=estado.descricao,
        conta_id=estado.conta_id,
        conta_destino_id=estado.conta_destino_id,
        categoria_id=estado.categoria_id,
        dono_usuario_id=estado.dono_usuario_id,
        observacao=estado.observacao,
        criado_por_id=ctx.usuario_id,
        tag_ids=estado.tag_ids,
        numero_final=numero_final,
    )
    db.commit()
    return montar_saidas(db, [primeira])[0]


def criar(db: Session, ctx: Contexto, entrada: LancamentoEntrada) -> LancamentoSaida:
    dados = entrada.model_dump()
    recorrencia = dados.pop("recorrencia")
    dados["tag_ids"] = dados["tag_ids"] or []
    if recorrencia is not None:
        return _criar_recorrencia(db, ctx, dados, recorrencia)
    if dados["situacao"] is None:
        dados["situacao"] = "confirmada" if dados["data"] <= hoje() else "prevista"
    estado = Estado(**dados)
    validar(db, ctx, estado, None)

    lancamento = Lancamento(criado_por_id=ctx.usuario_id)
    _aplicar(lancamento, estado)
    db.add(lancamento)
    db.flush()
    substituir_tags(db, lancamento.id, estado.tag_ids)
    db.commit()
    return montar_saidas(db, [lancamento])[0]


def editar(
    db: Session,
    ctx: Contexto,
    lancamento_id: int,
    entrada: LancamentoEdicaoEntrada,
    alcance: Alcance | None = None,
) -> LancamentoSaida:
    atual = lancamento_gravavel(db, ctx, lancamento_id)
    if atual.tipo in ("aplicacao", "resgate"):
        # Import dentro da função: metas_movimentos importa este módulo.
        from app.services import metas_movimentos

        metas_movimentos.editar_movimento(db, ctx, atual, entrada)
        return montar_saidas(db, [atual])[0]
    if atual.tipo == "reajuste":
        raise AppError(409, LANCAMENTO_NAO_EDITAVEL, "Reajuste não é editável; exclua-o.")
    if atual.tipo == "pagamento_fatura":
        raise AppError(409, LANCAMENTO_NAO_EDITAVEL, "Use as ações da fatura")
    _contas_ativas(db, atual)
    if atual.recorrencia_id is not None:
        if alcance is None:
            raise invalido("alcance", "Escolha o alcance.")
        if alcance != "somente_este":
            # Import dentro da função: recorrencias_alcance importa este módulo.
            from app.services import recorrencias_alcance

            return recorrencias_alcance.editar_conjunto(db, ctx, atual, entrada, alcance)

    # PATCH sobre o estado atual: campo não enviado mantém o valor atual (dono nulo é "casal").
    enviados = entrada.model_fields_set
    dados = {
        campo: getattr(entrada if campo in enviados else atual, campo) for campo in _CAMPOS_PATCH
    }
    tag_ids = entrada.tag_ids if "tag_ids" in enviados else tag_ids_atuais(db, atual.id)
    estado = Estado(tipo=atual.tipo, tag_ids=tag_ids, **dados)
    validar(db, ctx, estado, atual)

    _aplicar(atual, estado)
    substituir_tags(db, atual.id, estado.tag_ids)
    db.commit()
    return montar_saidas(db, [atual])[0]


def confirmar(
    db: Session, ctx: Contexto, lancamento_id: int, valor: Decimal | None = None
) -> LancamentoSaida:
    lancamento = lancamento_gravavel(db, ctx, lancamento_id)
    if lancamento.tipo in ("aplicacao", "resgate"):
        # Import dentro da função: metas_movimentos importa este módulo.
        from app.services import metas_movimentos

        metas_movimentos.confirmar_movimento(db, ctx, lancamento, valor)
        return montar_saidas(db, [lancamento])[0]
    if lancamento.tipo == "pagamento_fatura":
        raise AppError(409, LANCAMENTO_NAO_EDITAVEL, "Use as ações da fatura")
    if lancamento.situacao == "confirmada":
        raise AppError(409, LANCAMENTO_JA_CONFIRMADO, "Lançamento já confirmado.")
    _contas_ativas(db, lancamento)
    if valor is not None:
        lancamento.valor = valor
    lancamento.situacao = "confirmada"
    db.commit()
    return montar_saidas(db, [lancamento])[0]


def excluir(
    db: Session,
    ctx: Contexto,
    lancamento_id: int,
    alcance: Alcance | None = None,
) -> None:
    lancamento = lancamento_gravavel(db, ctx, lancamento_id)
    if lancamento.tipo in ("aplicacao", "resgate"):
        # Import dentro da função: metas_movimentos importa este módulo.
        from app.services import metas_movimentos

        metas_movimentos.excluir_movimento(db, ctx, lancamento)
        return
    if lancamento.tipo == "pagamento_fatura":
        raise AppError(409, LANCAMENTO_NAO_EDITAVEL, "Use as ações da fatura")
    _contas_ativas(db, lancamento)
    if lancamento.recorrencia_id is not None:
        if alcance is None:
            raise invalido("alcance", "Escolha o alcance.")
        if alcance != "somente_este":
            # Import dentro da função: recorrencias_alcance importa este módulo.
            from app.services import recorrencias_alcance

            recorrencias_alcance.excluir_conjunto(db, ctx, lancamento, alcance)
            return

    remover_tags(db, lancamento.id)
    db.delete(lancamento)
    db.commit()
