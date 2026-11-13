from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.acesso import Contexto, conta_visivel
from app.errors import SEM_VINCULO, AppError
from app.models.casal import Casal
from app.models.categoria import Categoria
from app.models.conta import Conta
from app.models.lancamento import Lancamento
from app.models.usuario import Usuario
from app.money import para_str, quantizar
from app.schemas.proporcao import PessoaProporcaoSaida, ProporcaoSaida
from app.services import ganchos
from app.tempo import fim_do_mes, formatar_mes, hoje, mes_ref, parse_mes, validar_data

_ZERO = Decimal("0.00")
_CENTESIMO = Decimal("0.01")


@dataclass(frozen=True)
class PessoaProporcao:
    usuario_id: int
    nome: str
    porcentagem: Decimal
    devido: Decimal
    aportado: Decimal
    faltante: Decimal
    excedente: Decimal


@dataclass(frozen=True)
class ResultadoProporcao:
    mes: date
    base_despesas_casal: Decimal
    origem_porcentagem: str
    mes_origem: date | None
    pessoas: list[PessoaProporcao]


def _centavos(valor: Decimal) -> int:
    return int(quantizar(valor).scaleb(2))


def _de_centavos(centavos: int) -> Decimal:
    return (Decimal(centavos) / 100).quantize(_CENTESIMO)


def percentual(s_c: int, t_c: int) -> Decimal:
    """Porcentagem de `s_c` em `t_c` (centavos), arredondada meio para cima em duas casas (§4.6 passo 4)."""
    centesimos = (s_c * 10000 * 2 + t_c) // (2 * t_c)
    return _de_centavos(centesimos)


def porcentagens(s_a_c: int, s_b_c: int) -> tuple[Decimal, Decimal]:
    """Porcentagens de A e de B somando sempre 100,00: B é o complemento de A (D-063)."""
    t_c = s_a_c + s_b_c
    a = percentual(s_a_c, t_c)
    b = (Decimal("100.00") - a).quantize(_CENTESIMO)
    return a, b


def rateio(base: Decimal, s_a: Decimal, s_b: Decimal) -> tuple[Decimal, Decimal]:
    """Devido de A e de B em centavos inteiros; a soma é sempre a base (§4.7, RF-3.15)."""
    base_c = _centavos(base)
    s_a_c = _centavos(s_a)
    s_b_c = _centavos(s_b)
    t_c = s_a_c + s_b_c
    if s_a_c <= s_b_c:
        dev_a = (base_c * s_a_c * 2 + t_c) // (2 * t_c)
        return _de_centavos(dev_a), _de_centavos(base_c - dev_a)
    dev_b = (base_c * s_b_c * 2 + t_c) // (2 * t_c)
    return _de_centavos(base_c - dev_b), _de_centavos(dev_b)


def _consulta_salarios(casal: Casal, *colunas):
    pai = aliased(Categoria)
    return (
        select(*colunas)
        .select_from(Lancamento)
        .join(Categoria, Categoria.id == Lancamento.categoria_id)
        .outerjoin(pai, pai.id == Categoria.categoria_pai_id)
        .where(
            Lancamento.tipo == "receita",
            Lancamento.dono_usuario_id.in_((casal.pessoa_a_id, casal.pessoa_b_id)),
            or_(
                and_(Categoria.categoria_pai_id.is_(None), Categoria.fixa == 1),
                and_(pai.categoria_pai_id.is_(None), pai.fixa == 1),
            ),
        )
    )


def salarios_por_dono(db: Session, casal: Casal, mes: date) -> tuple[Decimal, Decimal]:
    consulta = _consulta_salarios(
        casal, Lancamento.dono_usuario_id, func.sum(Lancamento.valor)
    ).where(Lancamento.data.between(mes, fim_do_mes(mes))).group_by(Lancamento.dono_usuario_id)
    por_dono = {dono: Decimal(soma) for dono, soma in db.execute(consulta)}
    return por_dono.get(casal.pessoa_a_id, _ZERO), por_dono.get(casal.pessoa_b_id, _ZERO)


def soma_salarios_mes(db: Session, casal: Casal, mes: date) -> Decimal:
    s_a, s_b = salarios_por_dono(db, casal, mes)
    return s_a + s_b


def _ultimo_mes_com_salario(db: Session, casal: Casal, mes: date) -> date | None:
    mes_ano = func.date_format(Lancamento.data, "%Y-%m")
    consulta = (
        _consulta_salarios(casal, mes_ano)
        .where(Lancamento.data < mes)
        .group_by(mes_ano)
        .having(func.sum(Lancamento.valor) > 0)
        .order_by(mes_ano.desc())
        .limit(1)
    )
    texto = db.scalar(consulta)
    return parse_mes(texto) if texto is not None else None


def _base_despesas(db: Session, casal_id: int, mes: date) -> Decimal:
    soma = db.scalar(
        select(func.sum(Lancamento.valor))
        .select_from(Lancamento)
        .join(Conta, Conta.id == Lancamento.conta_id)
        .where(
            Lancamento.tipo == "despesa",
            Lancamento.dono_usuario_id.is_(None),
            Conta.casal_id == casal_id,
            Lancamento.data.between(mes, fim_do_mes(mes)),
        )
    )
    return Decimal(soma or _ZERO) + ganchos.base_cartao_conjunta(db, casal_id, mes)


def _aportes(db: Session, casal_id: int, mes: date) -> dict[int, Decimal]:
    origem = aliased(Conta)
    destino = aliased(Conta)
    consulta = (
        select(origem.usuario_id, func.sum(Lancamento.valor))
        .select_from(Lancamento)
        .join(origem, origem.id == Lancamento.conta_id)
        .join(destino, destino.id == Lancamento.conta_destino_id)
        .where(
            Lancamento.tipo == "transferencia",
            Lancamento.situacao == "confirmada",
            origem.usuario_id.is_not(None),
            destino.casal_id == casal_id,
            Lancamento.data.between(mes, fim_do_mes(mes)),
        )
        .group_by(origem.usuario_id)
    )
    return {usuario_id: Decimal(soma) for usuario_id, soma in db.execute(consulta)}


def _pessoa(
    db: Session,
    usuario_id: int,
    porcentagem: Decimal,
    devido: Decimal,
    aportado: Decimal,
) -> PessoaProporcao:
    usuario = db.get(Usuario, usuario_id)
    return PessoaProporcao(
        usuario_id=usuario_id,
        nome=usuario.nome,
        porcentagem=porcentagem,
        devido=devido,
        aportado=aportado,
        faltante=max(devido - aportado, _ZERO),
        excedente=max(aportado - devido, _ZERO),
    )


def calcular(db: Session, ctx: Contexto, mes: date) -> ResultadoProporcao:
    if ctx.casal_ativo_id is None:
        raise AppError(409, SEM_VINCULO, "Você não está vinculado a um casal.")
    ganchos.antes_de_ler_periodo(db, ctx, fim_do_mes(mes))
    casal = db.get(Casal, ctx.casal_ativo_id)

    s_a, s_b = salarios_por_dono(db, casal, mes)
    origem = "mes"
    mes_origem = None
    if s_a + s_b == 0:
        anterior = _ultimo_mes_com_salario(db, casal, mes)
        if anterior is not None:
            s_a, s_b = salarios_por_dono(db, casal, anterior)
            origem = "herdada"
            mes_origem = anterior
        else:
            s_a = s_b = Decimal(1)
            origem = "padrao_50_50"

    base = _base_despesas(db, ctx.casal_ativo_id, mes)
    dev_a, dev_b = rateio(base, s_a, s_b)
    aportes = _aportes(db, ctx.casal_ativo_id, mes)
    pct_a, pct_b = porcentagens(_centavos(s_a), _centavos(s_b))
    pessoas = [
        _pessoa(
            db,
            casal.pessoa_a_id,
            pct_a,
            dev_a,
            aportes.get(casal.pessoa_a_id, _ZERO),
        ),
        _pessoa(
            db,
            casal.pessoa_b_id,
            pct_b,
            dev_b,
            aportes.get(casal.pessoa_b_id, _ZERO),
        ),
    ]
    return ResultadoProporcao(
        mes=mes,
        base_despesas_casal=base,
        origem_porcentagem=origem,
        mes_origem=mes_origem,
        pessoas=pessoas,
    )


def _pessoa_saida(pessoa: PessoaProporcao) -> PessoaProporcaoSaida:
    return PessoaProporcaoSaida(
        usuario_id=pessoa.usuario_id,
        nome=pessoa.nome,
        porcentagem=para_str(pessoa.porcentagem),
        devido=para_str(pessoa.devido),
        aportado=para_str(pessoa.aportado),
        faltante=para_str(pessoa.faltante),
        excedente=para_str(pessoa.excedente),
    )


def proporcao_do_mes(db: Session, ctx: Contexto, mes: date) -> ProporcaoSaida:
    resultado = calcular(db, ctx, mes)
    return ProporcaoSaida(
        mes=formatar_mes(resultado.mes),
        base_despesas_casal=para_str(resultado.base_despesas_casal),
        origem_porcentagem=resultado.origem_porcentagem,
        mes_origem=None if resultado.mes_origem is None else formatar_mes(resultado.mes_origem),
        pessoas=[_pessoa_saida(pessoa) for pessoa in resultado.pessoas],
    )


def sugestao_aporte(
    db: Session, ctx: Contexto, conta_origem_id: int, data: date
) -> Decimal | None:
    validar_data(data, hoje())
    conta = conta_visivel(db, ctx, conta_origem_id)
    if ctx.casal_ativo_id is None:
        return None
    casal = db.get(Casal, ctx.casal_ativo_id)
    if conta.usuario_id not in (casal.pessoa_a_id, casal.pessoa_b_id):
        return None
    resultado = calcular(db, ctx, mes_ref(data))
    dona = next(p for p in resultado.pessoas if p.usuario_id == conta.usuario_id)
    return dona.faltante if dona.faltante != _ZERO else None
