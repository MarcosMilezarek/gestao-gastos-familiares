from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.acesso import Contexto, cenario_gravavel, cenario_visivel
from app.errors import NAO_ENCONTRADO, SEM_VINCULO, VALIDACAO, AppError
from app.models.casal import Casal
from app.models.planejamento import Cenario, CenarioItem
from app.models.usuario import Usuario
from app.money import para_str
from app.schemas.cenario import CenarioEdicao, CenarioEntrada, ItemEdicao, ItemEntrada
from app.services.planejamento_calculo import resultado_cenario

_ZERO = Decimal("0.00")


def _texto(valor: Decimal | None) -> str | None:
    return None if valor is None else para_str(valor)


def _travar_cenario(db: Session, ctx: Contexto, cenario_id: int) -> Cenario:
    cenario_gravavel(db, ctx, cenario_id)
    cenario = db.scalar(
        select(Cenario)
        .where(Cenario.id == cenario_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if cenario is None:
        # Excluído entre a checagem de acesso e a trava.
        raise AppError(404, NAO_ENCONTRADO, "Cenário não encontrado.")
    return cenario


def _nomes(db: Session, casal: Casal) -> dict[int, str]:
    usuarios = db.scalars(
        select(Usuario).where(Usuario.id.in_([casal.pessoa_a_id, casal.pessoa_b_id]))
    ).all()
    return {usuario.id: usuario.nome for usuario in usuarios}


def _itens_por_cenario(db: Session, cenario_ids: list[int]) -> dict[int, list[CenarioItem]]:
    if not cenario_ids:
        return {}
    grupos: dict[int, list[CenarioItem]] = {cenario_id: [] for cenario_id in cenario_ids}
    itens = db.scalars(
        select(CenarioItem)
        .where(CenarioItem.cenario_id.in_(cenario_ids))
        .order_by(CenarioItem.id)
    ).all()
    for item in itens:
        grupos[item.cenario_id].append(item)
    return grupos


def _resultado(itens: list[CenarioItem], casal: Casal, nomes: dict[int, str]) -> dict:
    a, b = casal.pessoa_a_id, casal.pessoa_b_id
    rendas = {a: _ZERO, b: _ZERO}
    despesas = {None: _ZERO, a: _ZERO, b: _ZERO}
    for item in itens:
        if item.tipo == "renda":
            rendas[item.dono_usuario_id] += item.valor
        else:
            despesas[item.dono_usuario_id] += item.valor
    calculo = resultado_cenario(rendas[a], rendas[b], despesas[None], despesas[a], despesas[b])
    pessoas = [
        {
            "usuario_id": pessoa,
            "nome": nomes[pessoa],
            "renda": para_str(rendas[pessoa]),
            "porcentagem": _texto(calculo[chave]["porcentagem"]),
            "aporte": _texto(calculo[chave]["aporte"]),
            "despesas_proprias": para_str(despesas[pessoa]),
            "sobra": _texto(calculo[chave]["sobra"]),
        }
        for chave, pessoa in (("a", a), ("b", b))
    ]
    return {
        "total_rendas": para_str(calculo["total_rendas"]),
        "total_despesas": para_str(calculo["total_despesas"]),
        "saldo_mensal": para_str(calculo["saldo_mensal"]),
        "sem_proporcao": calculo["sem_proporcao"],
        "base_casal": para_str(despesas[None]),
        "pessoas": pessoas,
    }


def _item_saida(item: CenarioItem, nomes: dict[int, str]) -> dict:
    dono = item.dono_usuario_id
    return {
        "id": item.id,
        "tipo": item.tipo,
        "dono_usuario_id": dono,
        "dono_nome": "Casal" if dono is None else nomes[dono],
        "descricao": item.descricao,
        "valor": para_str(item.valor),
    }


def _saida(cenario: Cenario, itens: list[CenarioItem], casal: Casal, nomes: dict[int, str]) -> dict:
    return {
        "id": cenario.id,
        "nome": cenario.nome,
        "itens": [_item_saida(item, nomes) for item in itens],
        "resultado": _resultado(itens, casal, nomes),
    }


def _saida_do_cenario(db: Session, cenario: Cenario) -> dict:
    casal = db.get(Casal, cenario.casal_id)
    itens = _itens_por_cenario(db, [cenario.id])[cenario.id]
    return _saida(cenario, itens, casal, _nomes(db, casal))


def _validar_dono(tipo: str, dono: int | None, casal: Casal) -> None:
    if tipo == "renda" and dono is None:
        mensagem = "Renda precisa de um dono: uma pessoa do casal."
        raise AppError(422, VALIDACAO, mensagem, campos={"dono_usuario_id": mensagem})
    if dono is not None and dono not in (casal.pessoa_a_id, casal.pessoa_b_id):
        mensagem = "Dono precisa ser uma pessoa do casal do cenário."
        raise AppError(422, VALIDACAO, mensagem, campos={"dono_usuario_id": mensagem})


def _item_do_cenario(db: Session, cenario: Cenario, item_id: int) -> CenarioItem:
    item = db.scalar(
        select(CenarioItem).where(
            CenarioItem.id == item_id, CenarioItem.cenario_id == cenario.id
        )
    )
    if item is None:
        raise AppError(404, NAO_ENCONTRADO, "Item do cenário não encontrado.")
    return item


def listar(db: Session, ctx: Contexto) -> list[dict]:
    if ctx.casal_ativo_id is None:
        return []
    casal = db.get(Casal, ctx.casal_ativo_id)
    nomes = _nomes(db, casal)
    cenarios = db.scalars(
        select(Cenario)
        .where(Cenario.casal_id == casal.id)
        .order_by(Cenario.nome, Cenario.id)
    ).all()
    itens = _itens_por_cenario(db, [cenario.id for cenario in cenarios])
    saidas = []
    for cenario in cenarios:
        resultado = _resultado(itens[cenario.id], casal, nomes)
        saidas.append(
            {
                "id": cenario.id,
                "nome": cenario.nome,
                "total_rendas": resultado["total_rendas"],
                "total_despesas": resultado["total_despesas"],
                "saldo_mensal": resultado["saldo_mensal"],
            }
        )
    return saidas


def detalhe(db: Session, ctx: Contexto, cenario_id: int) -> dict:
    return _saida_do_cenario(db, cenario_visivel(db, ctx, cenario_id))


def criar(db: Session, ctx: Contexto, dados: CenarioEntrada) -> dict:
    if ctx.casal_ativo_id is None:
        raise AppError(409, SEM_VINCULO, "Você não está vinculado a um casal.")
    cenario = Cenario(casal_id=ctx.casal_ativo_id, nome=dados.nome)
    db.add(cenario)
    db.commit()
    return _saida_do_cenario(db, cenario)


def editar(db: Session, ctx: Contexto, cenario_id: int, dados: CenarioEdicao) -> dict:
    cenario = cenario_gravavel(db, ctx, cenario_id)
    cenario.nome = dados.nome
    db.commit()
    return _saida_do_cenario(db, cenario)


def excluir(db: Session, ctx: Contexto, cenario_id: int) -> None:
    cenario = _travar_cenario(db, ctx, cenario_id)
    db.execute(delete(CenarioItem).where(CenarioItem.cenario_id == cenario.id))
    db.delete(cenario)
    db.commit()


def criar_item(db: Session, ctx: Contexto, cenario_id: int, dados: ItemEntrada) -> dict:
    cenario = _travar_cenario(db, ctx, cenario_id)
    _validar_dono(dados.tipo, dados.dono_usuario_id, db.get(Casal, cenario.casal_id))
    db.add(
        CenarioItem(
            cenario_id=cenario.id,
            tipo=dados.tipo,
            dono_usuario_id=dados.dono_usuario_id,
            descricao=dados.descricao,
            valor=dados.valor,
        )
    )
    db.commit()
    return _saida_do_cenario(db, cenario)


def editar_item(
    db: Session, ctx: Contexto, cenario_id: int, item_id: int, dados: ItemEdicao
) -> dict:
    cenario = _travar_cenario(db, ctx, cenario_id)
    item = _item_do_cenario(db, cenario, item_id)
    dono = dados.dono_usuario_id if "dono_usuario_id" in dados.model_fields_set else item.dono_usuario_id
    _validar_dono(item.tipo, dono, db.get(Casal, cenario.casal_id))
    for campo in dados.model_fields_set:
        setattr(item, campo, getattr(dados, campo))
    db.commit()
    return _saida_do_cenario(db, cenario)


def excluir_item(db: Session, ctx: Contexto, cenario_id: int, item_id: int) -> dict:
    cenario = _travar_cenario(db, ctx, cenario_id)
    db.delete(_item_do_cenario(db, cenario, item_id))
    db.commit()
    return _saida_do_cenario(db, cenario)
