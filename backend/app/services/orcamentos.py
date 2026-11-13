from datetime import date
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import tempo
from app.acesso import Contexto, categorias_visiveis, orcamento_do_mes
from app.errors import (
    NAO_ENCONTRADO,
    ORCAMENTO_ANTERIOR_INEXISTENTE,
    ORCAMENTO_JA_EXISTE,
    SEM_VINCULO,
    VALIDACAO,
    AppError,
)
from app.models.casal import Casal
from app.models.categoria import Categoria
from app.models.planejamento import Orcamento, OrcamentoItem
from app.money import para_str
from app.schemas.orcamento import (
    CategoriaSaida,
    OrcamentoEntrada,
    OrcamentoMesSaida,
    OrcamentoSaida,
    ResumoSaida,
    SubcategoriaSaida,
)
from app.services import ganchos, proporcao
from app.services.planejamento_calculo import dividir_renda, resumo_orcamento

_ZERO = Decimal("0.00")
_MSG_CATEGORIA_INVALIDA = "Categoria inválida para o orçamento; confira as categorias informadas."


def renda_sugerida(db: Session, ctx: Contexto, mes: date) -> Decimal:
    if ctx.casal_ativo_id is None:
        return _ZERO
    casal = db.get(Casal, ctx.casal_ativo_id)
    return proporcao.soma_salarios_mes(db, casal, mes)


def limites_efetivos(linhas: list[tuple[int, int | None, Decimal]]) -> dict[int, Decimal]:
    """Limite efetivo de cada mãe: a soma das subcategorias, se houver; senão o limite próprio.

    `linhas` traz (categoria_id, categoria_pai_id, limite) de cada linha do orçamento.
    """
    proprios: dict[int, Decimal] = {}
    somas: dict[int, Decimal] = {}
    for categoria_id, pai_id, limite in linhas:
        if pai_id is None:
            proprios[categoria_id] = limite
        else:
            somas[pai_id] = somas.get(pai_id, _ZERO) + limite
    return {
        mae: somas[mae] if mae in somas else proprios[mae]
        for mae in set(proprios) | set(somas)
    }


def montar_saida(
    mes: str | None,
    orcamento_id: int | None,
    renda: Decimal,
    percentual: Decimal,
    linhas: list[tuple[int, Decimal]],
    categorias: dict[int, Categoria],
) -> OrcamentoSaida:
    """Monta a saída a partir das linhas (categoria_id, limite) e das categorias já carregadas."""
    efetivos = limites_efetivos(
        [(cid, categorias[cid].categoria_pai_id, limite) for cid, limite in linhas]
    )
    subcategorias: dict[int, list[SubcategoriaSaida]] = {}
    for cid, limite in linhas:
        categoria = categorias[cid]
        if categoria.categoria_pai_id is not None:
            subcategorias.setdefault(categoria.categoria_pai_id, []).append(
                SubcategoriaSaida(
                    categoria_id=cid,
                    nome=categoria.nome,
                    arquivada=bool(categoria.arquivado),
                    limite=para_str(limite),
                )
            )
    categorias_saida = [
        CategoriaSaida(
            categoria_id=mae_id,
            nome=categorias[mae_id].nome,
            icone=categorias[mae_id].icone,
            cor=categorias[mae_id].cor,
            arquivada=bool(categorias[mae_id].arquivado),
            limite=para_str(efetivos[mae_id]),
            por_subcategoria=mae_id in subcategorias,
            subcategorias=sorted(subcategorias.get(mae_id, []), key=lambda s: s.nome),
        )
        for mae_id in sorted(efetivos, key=lambda i: categorias[i].nome)
    ]
    orcamento_gastos, economia = dividir_renda(renda, percentual)
    resumo = resumo_orcamento(renda, orcamento_gastos, list(efetivos.values()))
    economia_planejada = resumo["economia_planejada"]
    return OrcamentoSaida(
        id=orcamento_id,
        mes=mes,
        renda=para_str(renda),
        percentual_economia=para_str(percentual),
        orcamento_gastos=para_str(orcamento_gastos),
        economia=para_str(economia),
        categorias=categorias_saida,
        total_categorizado=para_str(resumo["total_categorizado"]),
        falta_distribuir=para_str(resumo["falta_distribuir"]),
        excedente=para_str(resumo["excedente"]),
        resumo=ResumoSaida(
            renda=para_str(renda),
            gastos_planejados=para_str(resumo["gastos_planejados"]),
            balanco_planejado=para_str(resumo["balanco_planejado"]),
            economia_planejada=None if economia_planejada is None else para_str(economia_planejada),
        ),
    )


def _categorias_gravadas(db: Session, ids: list[int]) -> dict[int, Categoria]:
    if not ids:
        return {}
    categorias = db.scalars(select(Categoria).where(Categoria.id.in_(ids))).all()
    return {c.id: c for c in categorias}


def _ids_do_corpo(entrada: OrcamentoEntrada) -> list[int]:
    ids: list[int] = []
    for categoria in entrada.categorias:
        ids.append(categoria.categoria_id)
        ids.extend(sub.categoria_id for sub in categoria.subcategorias or [])
    return ids


def _linhas_do_corpo(entrada: OrcamentoEntrada) -> list[tuple[int, Decimal]]:
    linhas: list[tuple[int, Decimal]] = []
    for categoria in entrada.categorias:
        if categoria.subcategorias is None:
            linhas.append((categoria.categoria_id, categoria.limite))
        else:
            linhas.extend((sub.categoria_id, sub.limite) for sub in categoria.subcategorias)
    return linhas


def categorias_do_corpo(db: Session, ctx: Contexto, entrada: OrcamentoEntrada) -> dict[int, Categoria]:
    """Visibilidade do corpo recebido (prévia e escrita): uma consulta, depois as regras de mãe e subcategoria."""
    ids = _ids_do_corpo(entrada)
    categorias = categorias_visiveis(db, ctx, ids)
    if any(cid not in categorias for cid in ids):
        raise AppError(422, VALIDACAO, _MSG_CATEGORIA_INVALIDA, campos={"categorias": _MSG_CATEGORIA_INVALIDA})
    for categoria in entrada.categorias:
        mae = categorias[categoria.categoria_id]
        if mae.categoria_pai_id is not None or mae.tipo != "despesa":
            raise AppError(422, VALIDACAO, _MSG_CATEGORIA_INVALIDA, campos={"categorias": _MSG_CATEGORIA_INVALIDA})
        for sub in categoria.subcategorias or []:
            if categorias[sub.categoria_id].categoria_pai_id != mae.id:
                raise AppError(422, VALIDACAO, _MSG_CATEGORIA_INVALIDA, campos={"categorias": _MSG_CATEGORIA_INVALIDA})
    return categorias


def obter(db: Session, ctx: Contexto, mes: str) -> OrcamentoMesSaida:
    mes_data = tempo.validar_mes(mes, tempo.hoje())
    if ctx.casal_ativo_id is None:
        return OrcamentoMesSaida(mes=tempo.formatar_mes(mes_data), orcamento=None, renda_sugerida=para_str(_ZERO))
    ganchos.antes_de_ler_periodo(db, ctx, tempo.fim_do_mes(mes_data))
    sugerida = renda_sugerida(db, ctx, mes_data)
    orcamento = orcamento_do_mes(db, ctx, mes_data)
    saida = None
    if orcamento is not None:
        itens = db.scalars(
            select(OrcamentoItem).where(OrcamentoItem.orcamento_id == orcamento.id)
        ).all()
        categorias = _categorias_gravadas(db, [item.categoria_id for item in itens])
        # Mãe só com subcategorias não tem linha própria: a mãe vem pelo pai das subcategorias.
        pais = {c.categoria_pai_id for c in categorias.values() if c.categoria_pai_id is not None}
        categorias.update(_categorias_gravadas(db, list(pais - set(categorias))))
        saida = montar_saida(
            tempo.formatar_mes(mes_data),
            orcamento.id,
            orcamento.renda,
            orcamento.percentual_economia,
            [(item.categoria_id, item.limite) for item in itens],
            categorias,
        )
    return OrcamentoMesSaida(
        mes=tempo.formatar_mes(mes_data), orcamento=saida, renda_sugerida=para_str(sugerida)
    )


def previa(db: Session, ctx: Contexto, entrada: OrcamentoEntrada) -> OrcamentoSaida:
    categorias = categorias_do_corpo(db, ctx, entrada)
    return montar_saida(
        None,
        None,
        entrada.renda,
        entrada.percentual_economia,
        _linhas_do_corpo(entrada),
        categorias,
    )


_MSG_JA_EXISTE = "Já existe orçamento neste mês."
_MSG_ANTERIOR_INEXISTENTE = "Não há orçamento no mês anterior para copiar."
_MSG_NAO_ENCONTRADO = "Orçamento não encontrado."
_MSG_ARQUIVADA = "Categoria arquivada só pode ficar no orçamento se ele já a tinha."


def _exigir_casal(ctx: Contexto) -> None:
    if ctx.casal_ativo_id is None:
        raise AppError(409, SEM_VINCULO, "Você não está vinculado a um casal.")


def _categorias_com_maes(db: Session, ids: list[int]) -> dict[int, Categoria]:
    categorias = _categorias_gravadas(db, ids)
    pais = {c.categoria_pai_id for c in categorias.values() if c.categoria_pai_id is not None}
    categorias.update(_categorias_gravadas(db, list(pais - set(categorias))))
    return categorias


def _ids_no_orcamento(db: Session, orcamento_id: int) -> set[int]:
    """Categorias que o orçamento já traz: as das linhas e as mães das subcategorias."""
    ids = db.scalars(
        select(OrcamentoItem.categoria_id).where(OrcamentoItem.orcamento_id == orcamento_id)
    ).all()
    return set(_categorias_com_maes(db, list(ids)))


def _validar_arquivadas(entrada: OrcamentoEntrada, categorias: dict[int, Categoria], ja_no_orcamento: set[int]) -> None:
    """Categoria arquivada só é aceita se já está neste orçamento (RF-7.07)."""
    for cid in _ids_do_corpo(entrada):
        if categorias[cid].arquivado and cid not in ja_no_orcamento:
            raise AppError(422, VALIDACAO, _MSG_ARQUIVADA, campos={"categorias": _MSG_ARQUIVADA})


def _sai_na_copia(categorias: dict[int, Categoria], cid: int) -> bool:
    """Categoria arquivada, ou subcategoria de mãe arquivada, não entra na cópia (RF-7.07)."""
    categoria = categorias[cid]
    if categoria.arquivado:
        return True
    mae = categorias.get(categoria.categoria_pai_id)
    return bool(mae and mae.arquivado)


def _itens(orcamento_id: int, linhas: list[tuple[int, Decimal]]) -> list[OrcamentoItem]:
    return [
        OrcamentoItem(orcamento_id=orcamento_id, categoria_id=cid, limite=limite)
        for cid, limite in linhas
    ]


def travar_orcamento(db: Session, ctx: Contexto, mes: date) -> Orcamento:
    atual = orcamento_do_mes(db, ctx, mes)
    if atual is None:
        raise AppError(404, NAO_ENCONTRADO, _MSG_NAO_ENCONTRADO)
    orcamento = db.scalar(
        select(Orcamento)
        .where(Orcamento.id == atual.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if orcamento is None:
        # Excluído entre a checagem de acesso e a trava.
        raise AppError(404, NAO_ENCONTRADO, _MSG_NAO_ENCONTRADO)
    return orcamento


def _inserir(db: Session, orcamento: Orcamento, linhas: list[tuple[int, Decimal]]) -> Orcamento:
    try:
        db.add(orcamento)
        db.flush()
        db.add_all(_itens(orcamento.id, linhas))
        db.commit()
    except IntegrityError as erro:
        db.rollback()
        if "uq_orcamento_casal_id_mes_ref" not in str(erro.orig):
            raise
        raise AppError(409, ORCAMENTO_JA_EXISTE, _MSG_JA_EXISTE) from erro
    return orcamento


def _substituir(
    db: Session, orcamento: Orcamento, renda: Decimal, percentual: Decimal, linhas: list[tuple[int, Decimal]]
) -> None:
    db.execute(delete(OrcamentoItem).where(OrcamentoItem.orcamento_id == orcamento.id))
    orcamento.renda = renda
    orcamento.percentual_economia = percentual
    db.add_all(_itens(orcamento.id, linhas))
    db.commit()


def criar(db: Session, ctx: Contexto, mes: str, entrada: OrcamentoEntrada) -> OrcamentoSaida:
    mes_data = tempo.validar_mes(mes, tempo.hoje())
    _exigir_casal(ctx)
    categorias = categorias_do_corpo(db, ctx, entrada)
    _validar_arquivadas(entrada, categorias, set())
    linhas = _linhas_do_corpo(entrada)
    orcamento = _inserir(
        db,
        Orcamento(
            casal_id=ctx.casal_ativo_id,
            mes_ref=mes_data,
            renda=entrada.renda,
            percentual_economia=entrada.percentual_economia,
        ),
        linhas,
    )
    return montar_saida(
        tempo.formatar_mes(mes_data),
        orcamento.id,
        entrada.renda,
        entrada.percentual_economia,
        linhas,
        categorias,
    )


def substituir(db: Session, ctx: Contexto, mes: str, entrada: OrcamentoEntrada) -> OrcamentoSaida:
    mes_data = tempo.validar_mes(mes, tempo.hoje())
    _exigir_casal(ctx)
    orcamento = travar_orcamento(db, ctx, mes_data)
    categorias = categorias_do_corpo(db, ctx, entrada)
    _validar_arquivadas(entrada, categorias, _ids_no_orcamento(db, orcamento.id))
    linhas = _linhas_do_corpo(entrada)
    _substituir(db, orcamento, entrada.renda, entrada.percentual_economia, linhas)
    return montar_saida(
        tempo.formatar_mes(mes_data),
        orcamento.id,
        entrada.renda,
        entrada.percentual_economia,
        linhas,
        categorias,
    )


def excluir(db: Session, ctx: Contexto, mes: str) -> None:
    mes_data = tempo.validar_mes(mes, tempo.hoje())
    _exigir_casal(ctx)
    orcamento = travar_orcamento(db, ctx, mes_data)
    db.execute(delete(OrcamentoItem).where(OrcamentoItem.orcamento_id == orcamento.id))
    db.delete(orcamento)
    db.commit()


def copiar_do_anterior(
    db: Session, ctx: Contexto, mes: str, substituir: bool
) -> OrcamentoSaida:
    mes_data = tempo.validar_mes(mes, tempo.hoje())
    _exigir_casal(ctx)
    # Gancho antes de qualquer trava: pode confirmar a transação (fatia-3.md D5).
    ganchos.antes_de_ler_periodo(db, ctx, tempo.fim_do_mes(mes_data))
    anterior = orcamento_do_mes(db, ctx, tempo.somar_meses(mes_data, -1))
    if anterior is None:
        raise AppError(409, ORCAMENTO_ANTERIOR_INEXISTENTE, _MSG_ANTERIOR_INEXISTENTE)
    destino = orcamento_do_mes(db, ctx, mes_data)
    if destino is not None:
        if not substituir:
            raise AppError(409, ORCAMENTO_JA_EXISTE, _MSG_JA_EXISTE)
        destino = travar_orcamento(db, ctx, mes_data)
    renda = renda_sugerida(db, ctx, mes_data)
    percentual = anterior.percentual_economia
    itens = db.scalars(
        select(OrcamentoItem).where(OrcamentoItem.orcamento_id == anterior.id)
    ).all()
    categorias = _categorias_com_maes(db, [item.categoria_id for item in itens])
    linhas = [
        (item.categoria_id, item.limite)
        for item in itens
        if not _sai_na_copia(categorias, item.categoria_id)
    ]
    if destino is None:
        destino = _inserir(
            db,
            Orcamento(
                casal_id=ctx.casal_ativo_id,
                mes_ref=mes_data,
                renda=renda,
                percentual_economia=percentual,
            ),
            linhas,
        )
    else:
        _substituir(db, destino, renda, percentual, linhas)
    return montar_saida(
        tempo.formatar_mes(mes_data), destino.id, renda, percentual, linhas, categorias
    )
