from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.acesso import Contexto, _de_escopo_visivel, categoria_visivel, dono_da_lista
from app.errors import (
    CATEGORIA_ARQUIVADA,
    CATEGORIA_DESTINO_INVALIDO,
    CATEGORIA_EM_USO,
    CATEGORIA_FIXA,
    CATEGORIA_JA_EXISTE,
    CATEGORIA_NIVEL_INVALIDO,
    CATEGORIA_TIPO_INVALIDO,
    VALIDACAO,
    AppError,
)
from app.models.categoria import Categoria
from app.services.alvos_vinculo import ALVOS_CATEGORIA

_MSG_JA_EXISTE = "Já existe uma categoria com este nome."


def listar(
    db: Session, ctx: Contexto, tipo: str | None = None, incluir_arquivadas: bool = False
) -> list[dict]:
    visiveis = _de_escopo_visivel(Categoria, ctx)
    raizes = select(Categoria).where(visiveis, Categoria.categoria_pai_id.is_(None))
    subs = select(Categoria).where(visiveis, Categoria.categoria_pai_id.is_not(None))
    if tipo is not None:
        raizes = raizes.where(Categoria.tipo == tipo)
    if not incluir_arquivadas:
        raizes = raizes.where(Categoria.arquivado == 0)
        subs = subs.where(Categoria.arquivado == 0)
    raizes = db.scalars(raizes.order_by(Categoria.nome)).all()
    filhas: dict[int, list[Categoria]] = {}
    for sub in db.scalars(subs.order_by(Categoria.nome)).all():
        filhas.setdefault(sub.categoria_pai_id, []).append(sub)
    return [_com_subcategorias(raiz, filhas.get(raiz.id, [])) for raiz in raizes]


def criar(
    db: Session,
    ctx: Contexto,
    tipo: str,
    nome: str,
    icone: str,
    cor: str | None,
    categoria_pai_id: int | None,
) -> dict:
    coluna, valor = dono_da_lista(ctx)
    pai = None
    if categoria_pai_id is not None:
        pai = _visivel_no_corpo(db, ctx, categoria_pai_id, "categoria_pai_id")
        if pai.categoria_pai_id is not None:
            raise AppError(
                409, CATEGORIA_NIVEL_INVALIDO, "Subcategoria não pode ter subcategoria."
            )
        if pai.arquivado:
            raise AppError(409, CATEGORIA_ARQUIVADA, "A categoria-pai está arquivada.")
        if tipo != pai.tipo:
            raise AppError(
                409,
                CATEGORIA_TIPO_INVALIDO,
                "A subcategoria tem de ser do mesmo tipo da categoria-pai.",
            )
        # Subcategoria não tem cor própria: a cor vem da raiz na leitura.
        cor = None
    elif cor is None:
        mensagem = "Informe a cor da categoria."
        raise AppError(422, VALIDACAO, mensagem, campos={"cor": mensagem})

    pai_chave = pai.id if pai is not None else 0
    if _nome_repetido(db, getattr(Categoria, coluna) == valor, tipo, pai_chave, nome):
        raise AppError(409, CATEGORIA_JA_EXISTE, _MSG_JA_EXISTE, campos={"nome": _MSG_JA_EXISTE})

    categoria = Categoria(
        **{coluna: valor},
        tipo=tipo,
        nome=nome,
        icone=icone,
        cor=cor,
        categoria_pai_id=pai_chave or None,
        fixa=False,
        arquivado=False,
    )
    db.add(categoria)
    _gravar(db)
    return _saida(db, categoria)


def editar(
    db: Session,
    ctx: Contexto,
    categoria_id: int,
    nome: str | None = None,
    icone: str | None = None,
    cor: str | None = None,
) -> dict:
    categoria = categoria_visivel(db, ctx, categoria_id)
    if categoria.arquivado:
        raise AppError(409, CATEGORIA_ARQUIVADA, "Categoria arquivada não pode ser editada.")
    if nome is not None and nome != categoria.nome:
        if categoria.fixa:
            raise AppError(409, CATEGORIA_FIXA, "Esta categoria é fixa e não pode ser renomeada.")
        if _nome_repetido(
            db,
            Categoria.escopo == categoria.escopo,
            categoria.tipo,
            categoria.pai_chave,
            nome,
            excluir_id=categoria.id,
        ):
            raise AppError(
                409, CATEGORIA_JA_EXISTE, _MSG_JA_EXISTE, campos={"nome": _MSG_JA_EXISTE}
            )
        categoria.nome = nome
    if icone is not None:
        categoria.icone = icone
    # Cor só na raiz; em subcategoria o valor enviado é ignorado.
    if cor is not None and categoria.categoria_pai_id is None:
        categoria.cor = cor
    _gravar(db)
    return _saida(db, categoria)


def arquivar(
    db: Session, ctx: Contexto, categoria_id: int, mover_para_id: int | None = None
) -> dict:
    categoria = categoria_visivel(db, ctx, categoria_id)
    if categoria.fixa:
        raise AppError(409, CATEGORIA_FIXA, "Esta categoria é fixa e não pode ser arquivada.")
    familia = _familia(db, categoria)
    if _contar_usos(db, [c.id for c in familia]):
        if mover_para_id is None:
            mensagem = "Escolha a categoria para onde os lançamentos serão movidos."
            raise AppError(409, CATEGORIA_EM_USO, mensagem, campos={"mover_para_id": mensagem})
        destino = _destino_valido(db, ctx, categoria, mover_para_id, "mover_para_id")
        _reapontar(db, [c.id for c in familia], destino.id)
    for membro in familia:
        membro.arquivado = True
    db.commit()
    return _saida(db, categoria)


def mover_lancamentos(db: Session, ctx: Contexto, categoria_id: int, destino_id: int) -> dict:
    categoria = categoria_visivel(db, ctx, categoria_id)
    destino = _destino_valido(db, ctx, categoria, destino_id, "destino_id")
    movidos = _reapontar(db, [c.id for c in _familia(db, categoria)], destino.id)
    db.commit()
    return {"movidos": movidos}


def _familia(db: Session, categoria: Categoria) -> list[Categoria]:
    # Raiz move e arquiva com as subcategorias (decisão D5); subcategoria é só ela.
    if categoria.categoria_pai_id is not None:
        return [categoria]
    return [categoria, *_filhas(db, categoria.id)]


def _filhas(db: Session, pai_id: int) -> list[Categoria]:
    return db.scalars(
        select(Categoria).where(Categoria.categoria_pai_id == pai_id).order_by(Categoria.nome)
    ).all()


def _visivel_no_corpo(db: Session, ctx: Contexto, categoria_id: int, campo: str) -> Categoria:
    # Referência no corpo que não existe ou é de outro casal: 422 genérico (fatia-2.md §3).
    categoria = db.scalar(
        select(Categoria).where(Categoria.id == categoria_id, _de_escopo_visivel(Categoria, ctx))
    )
    if categoria is None:
        mensagem = "Categoria não encontrada."
        raise AppError(422, VALIDACAO, mensagem, campos={campo: mensagem})
    return categoria


def _destino_valido(
    db: Session, ctx: Contexto, origem: Categoria, destino_id: int, campo: str
) -> Categoria:
    destino = _visivel_no_corpo(db, ctx, destino_id, campo)
    fora_da_subarvore = destino.id != origem.id and destino.categoria_pai_id != origem.id
    if destino.tipo != origem.tipo or destino.arquivado or not fora_da_subarvore:
        raise AppError(409, CATEGORIA_DESTINO_INVALIDO, "Escolha outra categoria de destino.")
    return destino


def _nome_repetido(
    db: Session, escopo, tipo: str, pai_chave: int, nome: str, excluir_id: int | None = None
) -> bool:
    consulta = select(Categoria.id).where(
        escopo,
        Categoria.tipo == tipo,
        Categoria.pai_chave == pai_chave,
        Categoria.nome == nome,
    )
    if excluir_id is not None:
        consulta = consulta.where(Categoria.id != excluir_id)
    return db.scalar(consulta.limit(1)) is not None


def _contar_usos(db: Session, ids: list[int]) -> int:
    return sum(
        db.scalar(select(func.count()).select_from(alvo.modelo).where(alvo.coluna.in_(ids)))
        for alvo in ALVOS_CATEGORIA
    )


def _reapontar(db: Session, ids: list[int], destino_id: int) -> int:
    movidos = 0
    for alvo in ALVOS_CATEGORIA:
        resultado = db.execute(
            update(alvo.modelo)
            .where(alvo.coluna.in_(ids))
            .values({alvo.coluna: destino_id})
        )
        movidos += resultado.rowcount
    return movidos


def _gravar(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as erro:
        db.rollback()
        if "uq_categoria_escopo_tipo_pai_chave_nome" not in str(erro.orig):
            raise
        raise AppError(
            409, CATEGORIA_JA_EXISTE, _MSG_JA_EXISTE, campos={"nome": _MSG_JA_EXISTE}
        ) from erro


def _dados(categoria: Categoria, cor: str) -> dict:
    return {
        "id": categoria.id,
        "nome": categoria.nome,
        "tipo": categoria.tipo,
        "icone": categoria.icone,
        "cor": cor,
        "fixa": bool(categoria.fixa),
        "arquivado": bool(categoria.arquivado),
        "categoria_pai_id": categoria.categoria_pai_id,
    }


def _com_subcategorias(raiz: Categoria, subcategorias: list[Categoria]) -> dict:
    return {
        **_dados(raiz, raiz.cor),
        "subcategorias": [_dados(sub, raiz.cor) for sub in subcategorias],
    }


def _saida(db: Session, categoria: Categoria) -> dict:
    if categoria.categoria_pai_id is not None:
        pai = db.get(Categoria, categoria.categoria_pai_id)
        return _dados(categoria, pai.cor)
    return _com_subcategorias(categoria, _filhas(db, categoria.id))
