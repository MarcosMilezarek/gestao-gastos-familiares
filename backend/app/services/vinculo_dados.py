from decimal import Decimal

from sqlalchemy import and_, delete, select, update
from sqlalchemy.orm import Session, aliased

from app.models.casal import Casal
from app.models.categoria import Categoria, Tag
from app.models.conta import Conta
from app.models.usuario import Usuario
from app.services.alvos_vinculo import ALVOS_CATEGORIA, ALVOS_TAG
from app.services.padroes import criar_categorias_padrao, criar_conta_individual


def ao_cadastrar(db: Session, usuario: Usuario) -> None:
    """Conta individual e categorias padrão do cadastro. Roda na transação do chamador; não faz commit."""
    criar_conta_individual(db, usuario)
    criar_categorias_padrao(db, usuario.id)


def ao_vincular(db: Session, casal: Casal) -> None:
    """Conta conjunta e união de categorias e tags de A e B (§4.8). Roda na transação do chamador; não faz commit."""
    a, b, c = casal.pessoa_a_id, casal.pessoa_b_id, casal.id
    db.add(
        Conta(
            casal_id=c,
            nome="Conta conjunta",
            tipo="conta_corrente",
            cor="#8E24AA",
            saldo_inicial=Decimal("0.00"),
        )
    )
    # Converte no lugar: o id de A não muda, então os lançamentos de A seguem válidos.
    _converter_do_casal(db, Categoria, a, c)
    _unir_categorias(db, b, c)
    _converter_do_casal(db, Categoria, b, c)
    _converter_do_casal(db, Tag, a, c)
    _unir_tags(db, b, c)
    _converter_do_casal(db, Tag, b, c)


def ao_desvincular(db: Session, casal: Casal) -> None:
    """Conjunta arquivada e cópia das listas do casal para cada pessoa (§4.8). Roda na transação do chamador; não faz commit."""
    # Import dentro da função: ganchos importa este módulo.
    from app.services import ganchos

    conjunta = db.scalars(select(Conta).where(Conta.casal_id == casal.id)).first()
    if conjunta is not None:
        conjunta.arquivado = True
        ganchos.ao_arquivar_conta(db, conjunta)
    for pessoa_id in (casal.pessoa_a_id, casal.pessoa_b_id):
        mapa_categorias = _copiar_categorias(db, casal.id, pessoa_id)
        mapa_tags = _copiar_tags(db, casal.id, pessoa_id)
        _reapontar_da_pessoa(db, ALVOS_CATEGORIA, mapa_categorias, pessoa_id)
        _reapontar_da_pessoa(db, ALVOS_TAG, mapa_tags, pessoa_id)


def _converter_do_casal(db: Session, modelo: type, pessoa_id: int, casal_id: int) -> None:
    db.execute(
        update(modelo)
        .where(modelo.usuario_id == pessoa_id)
        .values(usuario_id=None, casal_id=casal_id)
        .execution_options(synchronize_session=False)
    )


def _reapontar(db: Session, alvos, antigo_id: int, novo_id: int) -> None:
    for alvo in alvos:
        db.execute(
            update(alvo.modelo)
            .where(alvo.coluna == antigo_id)
            .values({alvo.coluna: novo_id})
            .execution_options(synchronize_session=False)
        )


def _apagar(db: Session, modelo: type, id_: int) -> None:
    db.execute(
        delete(modelo).where(modelo.id == id_).execution_options(synchronize_session=False)
    )


def _resolver_ativa(db: Session, destino_id: int, arquivado_destino: bool, arquivado_origem: bool) -> None:
    # Resultante ativa se ao menos uma das duas estava ativa (D-026).
    if arquivado_destino and not arquivado_origem:
        db.execute(
            update(Categoria)
            .where(Categoria.id == destino_id)
            .values(arquivado=0)
            .execution_options(synchronize_session=False)
        )


def _unir_categorias(db: Session, b: int, c: int) -> None:
    raiz_b = aliased(Categoria)
    raiz_c = aliased(Categoria)
    pares = db.execute(
        select(raiz_b.id, raiz_b.arquivado, raiz_c.id, raiz_c.arquivado)
        .select_from(raiz_b)
        .join(
            raiz_c,
            and_(
                raiz_c.casal_id == c,
                raiz_c.categoria_pai_id.is_(None),
                raiz_c.tipo == raiz_b.tipo,
                raiz_c.nome == raiz_b.nome,
            ),
        )
        .where(raiz_b.usuario_id == b, raiz_b.categoria_pai_id.is_(None))
    ).all()
    for rb_id, rb_arquivado, rc_id, rc_arquivado in pares:
        _unir_subcategorias(db, b, c, rb_id, rc_id)
        _reapontar(db, ALVOS_CATEGORIA, rb_id, rc_id)
        _resolver_ativa(db, rc_id, rc_arquivado, rb_arquivado)
        _apagar(db, Categoria, rb_id)


def _unir_subcategorias(db: Session, b: int, c: int, rb_id: int, rc_id: int) -> None:
    sub_b = aliased(Categoria)
    sub_c = aliased(Categoria)
    pares = db.execute(
        select(sub_b.id, sub_b.arquivado, sub_c.id, sub_c.arquivado)
        .select_from(sub_b)
        .join(
            sub_c,
            and_(sub_c.categoria_pai_id == rc_id, sub_c.nome == sub_b.nome),
        )
        .where(sub_b.categoria_pai_id == rb_id)
    ).all()
    for sb_id, sb_arquivado, sc_id, sc_arquivado in pares:
        _reapontar(db, ALVOS_CATEGORIA, sb_id, sc_id)
        _resolver_ativa(db, sc_id, sc_arquivado, sb_arquivado)
        _apagar(db, Categoria, sb_id)
    # As demais filhas de B: pai de A e dono casal, em um único UPDATE.
    db.execute(
        update(Categoria)
        .where(Categoria.categoria_pai_id == rb_id)
        .values(categoria_pai_id=rc_id, usuario_id=None, casal_id=c)
        .execution_options(synchronize_session=False)
    )


def _unir_tags(db: Session, b: int, c: int) -> None:
    tag_b = aliased(Tag)
    tag_c = aliased(Tag)
    pares = db.execute(
        select(tag_b.id, tag_c.id)
        .select_from(tag_b)
        .join(tag_c, and_(tag_c.casal_id == c, tag_c.nome == tag_b.nome))
        .where(tag_b.usuario_id == b)
    ).all()
    for tb_id, tc_id in pares:
        for alvo in ALVOS_TAG:
            db.execute(
                update(alvo.modelo)
                .prefix_with("IGNORE")
                .where(alvo.coluna == tb_id)
                .values({alvo.coluna: tc_id})
                .execution_options(synchronize_session=False)
            )
            # Restaram só as ligações que já existiam na tag de A.
            db.execute(
                delete(alvo.modelo)
                .where(alvo.coluna == tb_id)
                .execution_options(synchronize_session=False)
            )
        _apagar(db, Tag, tb_id)


def _copiar_categorias(db: Session, casal_id: int, pessoa_id: int) -> dict[int, int]:
    # Raízes primeiro (pai nulo antes): a filha precisa do id já copiado do pai.
    originais = db.scalars(
        select(Categoria)
        .where(Categoria.casal_id == casal_id)
        .order_by(Categoria.categoria_pai_id.is_not(None), Categoria.id)
    ).all()
    mapa: dict[int, int] = {}
    for cat in originais:
        copia = Categoria(
            usuario_id=pessoa_id,
            categoria_pai_id=None if cat.categoria_pai_id is None else mapa[cat.categoria_pai_id],
            tipo=cat.tipo,
            nome=cat.nome,
            icone=cat.icone,
            cor=cat.cor,
            fixa=cat.fixa,
            arquivado=cat.arquivado,
        )
        db.add(copia)
        db.flush()
        mapa[cat.id] = copia.id
    return mapa


def _copiar_tags(db: Session, casal_id: int, pessoa_id: int) -> dict[int, int]:
    mapa: dict[int, int] = {}
    for tag in db.scalars(select(Tag).where(Tag.casal_id == casal_id)).all():
        copia = Tag(usuario_id=pessoa_id, nome=tag.nome)
        db.add(copia)
        db.flush()
        mapa[tag.id] = copia.id
    return mapa


def _reapontar_da_pessoa(db: Session, alvos, mapa: dict[int, int], pessoa_id: int) -> None:
    # Só as linhas de lançamentos em conta individual de P; os da conjunta ficam no casal encerrado.
    contas = select(Conta.id).where(Conta.usuario_id == pessoa_id)
    for alvo in alvos:
        for antigo_id, novo_id in mapa.items():
            db.execute(
                update(alvo.modelo)
                .where(alvo.coluna == antigo_id, _em_contas(alvo, contas))
                .values({alvo.coluna: novo_id})
                .execution_options(synchronize_session=False)
            )


def _em_contas(alvo, contas):
    # Condição sobre a linha do alvo: a conta do seu lançamento está em `contas` (direto ou pela ponte).
    if alvo.ponte is None:
        return alvo.conta.in_(contas)
    return alvo.ponte.in_(select(alvo.conta.class_.id).where(alvo.conta.in_(contas)))
