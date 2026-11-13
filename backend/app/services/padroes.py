from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.categoria import Categoria
from app.models.conta import Conta
from app.models.usuario import Usuario

# (nome, tipo, ícone, cor, fixa, subcategorias[(nome, ícone)]); só a raiz tem cor (§4.7).
_CATEGORIAS_PADRAO = (
    ("Moradia/Casa", "despesa", "house", "#6D4C41", False, ()),
    (
        "Gastos fixos",
        "despesa",
        "receipt",
        "#1E88E5",
        False,
        (("Contas", "file-text"), ("Saúde", "heart-pulse"), ("Transporte", "car")),
    ),
    (
        "Gastos variáveis",
        "despesa",
        "shopping-bag",
        "#F9A825",
        False,
        (
            ("Mercado", "shopping-cart"),
            ("Compras", "shopping-bag"),
            ("Alimentação fora", "utensils"),
            ("Assinaturas", "repeat"),
            ("Educação", "graduation-cap"),
            ("Lazer", "party-popper"),
        ),
    ),
    ("Investimento", "despesa", "piggy-bank", "#00897B", False, ()),
    ("Outros", "despesa", "ellipsis", "#757575", False, ()),
    (
        "Salário",
        "receita",
        "banknote",
        "#2E7D32",
        True,
        (("Salário", "banknote"), ("13º", "gift"), ("Férias", "tree-palm"), ("Horas extras", "clock")),
    ),
)


def criar_conta_individual(db: Session, usuario: Usuario) -> None:
    db.add(
        Conta(
            usuario_id=usuario.id,
            nome=f"Conta de {usuario.nome}"[:60].rstrip(),
            tipo="conta_corrente",
            cor="#1E88E5",
            saldo_inicial=Decimal("0.00"),
        )
    )


def criar_categorias_padrao(db: Session, usuario_id: int) -> None:
    for nome, tipo, icone, cor, fixa, subcategorias in _CATEGORIAS_PADRAO:
        raiz = Categoria(
            usuario_id=usuario_id, tipo=tipo, nome=nome, icone=icone, cor=cor, fixa=fixa
        )
        db.add(raiz)
        db.flush()
        for sub_nome, sub_icone in subcategorias:
            db.add(
                Categoria(
                    usuario_id=usuario_id,
                    categoria_pai_id=raiz.id,
                    tipo=tipo,
                    nome=sub_nome,
                    icone=sub_icone,
                )
            )
