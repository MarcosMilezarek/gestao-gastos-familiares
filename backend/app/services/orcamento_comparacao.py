from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app import tempo
from app.acesso import Contexto, orcamento_do_mes
from app.errors import NAO_ENCONTRADO, AppError
from app.models.categoria import Categoria
from app.models.planejamento import OrcamentoItem
from app.money import para_str
from app.schemas.orcamento import (
    ComparacaoLinha,
    ComparacaoLinhaCategoria,
    ComparacaoSaida,
    ComparacaoTotal,
)
from app.services.movimentos import gasto_por_categoria
from app.services.orcamentos import limites_efetivos
from app.services.planejamento_calculo import linha_comparacao

_ZERO = Decimal("0.00")
_NOME_AJUSTE = "Reajuste de fatura"


def _texto(valor: Decimal | None) -> str | None:
    return None if valor is None else para_str(valor)


def _campos(
    categoria_id: int | None,
    nome: str,
    icone: str | None,
    cor: str | None,
    arquivada: bool,
    limite: Decimal | None,
    gasto: Decimal,
) -> dict:
    restante, consumo, acima = linha_comparacao(limite, gasto)
    return {
        "categoria_id": categoria_id,
        "nome": nome,
        "icone": icone,
        "cor": cor,
        "arquivada": arquivada,
        "limite": _texto(limite),
        "gasto": para_str(gasto),
        "restante": _texto(restante),
        "consumo": _texto(consumo),
        "acima_do_limite": acima,
    }


def _categorias(db: Session, ids: set[int]) -> dict[int, Categoria]:
    """As categorias pedidas e as mães das subcategorias pedidas, numa só consulta por IN (inclusive arquivadas)."""
    if not ids:
        return {}
    consulta = select(Categoria).where(
        or_(
            Categoria.id.in_(ids),
            Categoria.id.in_(select(Categoria.categoria_pai_id).where(Categoria.id.in_(ids))),
        )
    )
    return {categoria.id: categoria for categoria in db.scalars(consulta)}


def comparar(db: Session, ctx: Contexto, mes: str) -> ComparacaoSaida:
    mes_data = tempo.validar_mes(mes, tempo.hoje())
    orcamento = orcamento_do_mes(db, ctx, mes_data)
    if orcamento is None:
        raise AppError(404, NAO_ENCONTRADO, "Orçamento não encontrado neste mês.")
    itens = db.execute(
        select(OrcamentoItem.categoria_id, OrcamentoItem.limite).where(
            OrcamentoItem.orcamento_id == orcamento.id
        )
    ).all()
    gastos = gasto_por_categoria(db, ctx, mes_data)
    ids = {cid for cid, _ in itens} | {cid for cid in gastos if cid is not None}
    cats = _categorias(db, ids)

    efetivos = limites_efetivos(
        [(cid, cats[cid].categoria_pai_id, limite) for cid, limite in itens]
    )
    subcategorias: dict[int, list[ComparacaoLinha]] = {}
    for cid, limite in itens:
        categoria = cats[cid]
        if categoria.categoria_pai_id is not None:
            mae = cats[categoria.categoria_pai_id]
            subcategorias.setdefault(mae.id, []).append(
                ComparacaoLinha(
                    **_campos(
                        cid,
                        categoria.nome,
                        categoria.icone,
                        mae.cor,
                        bool(categoria.arquivado),
                        limite,
                        gastos.get(cid, _ZERO),
                    )
                )
            )

    # Gasto da mãe = o próprio mais o das subcategorias (com ou sem limite).
    gasto_mae: dict[int, Decimal] = {}
    for cid, valor in gastos.items():
        if cid is None:
            continue
        mae_id = cid if cats[cid].categoria_pai_id is None else cats[cid].categoria_pai_id
        gasto_mae[mae_id] = gasto_mae.get(mae_id, _ZERO) + valor

    linhas: list[ComparacaoLinhaCategoria] = []
    for mae_id in sorted(efetivos, key=lambda i: cats[i].nome):
        mae = cats[mae_id]
        linhas.append(
            ComparacaoLinhaCategoria(
                **_campos(
                    mae.id,
                    mae.nome,
                    mae.icone,
                    mae.cor,
                    bool(mae.arquivado),
                    efetivos[mae_id],
                    gasto_mae.get(mae_id, _ZERO),
                ),
                subcategorias=sorted(subcategorias.get(mae_id, []), key=lambda s: s.nome),
            )
        )

    fora = [m for m, valor in gasto_mae.items() if m not in efetivos and valor != _ZERO]
    for mae_id in sorted(fora, key=lambda i: cats[i].nome):
        mae = cats[mae_id]
        linhas.append(
            ComparacaoLinhaCategoria(
                **_campos(
                    mae.id,
                    mae.nome,
                    mae.icone,
                    mae.cor,
                    bool(mae.arquivado),
                    None,
                    gasto_mae[mae_id],
                ),
                subcategorias=[],
            )
        )

    if gastos.get(None, _ZERO) != _ZERO:
        linhas.append(
            ComparacaoLinhaCategoria(
                **_campos(None, _NOME_AJUSTE, None, None, False, None, gastos[None]),
                subcategorias=[],
            )
        )

    planejado = sum(efetivos.values(), _ZERO)
    gasto_total = sum(gastos.values(), _ZERO)
    restante, consumo, acima = linha_comparacao(planejado, gasto_total)
    total = ComparacaoTotal(
        planejado=para_str(planejado),
        gasto=para_str(gasto_total),
        restante=_texto(restante),
        consumo=_texto(consumo),
        acima_do_limite=acima,
    )
    return ComparacaoSaida(mes=tempo.formatar_mes(mes_data), linhas=linhas, total=total)
