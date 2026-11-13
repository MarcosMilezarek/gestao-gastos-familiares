from collections.abc import Iterable
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.acesso import Contexto
from app.models.casal import Casal
from app.models.conta import Conta
from app.models.usuario import Usuario
from app.money import para_str
from app.schemas.balanco import BalancoConta, BalancoMes, DonoBalanco
from app.schemas.controle import par_saida, resumo_saida
from app.services.filtros_lista import Linha, ParValor, totalizar
from app.services.movimentos import carregar_mes, escopo_contas
from app.services.saldos import saldos_atuais, saldos_previstos
from app.tempo import fim_do_mes, formatar_mes

_ZERO = Decimal(0)
_CLASSES_TRANSFERENCIA = frozenset({"transferencia", "aporte"})


def calcular(db: Session, ctx: Contexto, mes: date) -> BalancoMes:
    contas = escopo_contas(db, ctx)
    linhas = carregar_mes(db, ctx, mes, contas)
    conta_ids = [conta.id for conta in contas]
    atuais = saldos_atuais(db, conta_ids)
    previstos = saldos_previstos(db, conta_ids, fim_do_mes(mes))
    return BalancoMes(
        mes=formatar_mes(mes),
        total=resumo_saida(totalizar(linhas)),
        contas=[
            _conta(conta, linhas, atuais[conta.id], previstos[conta.id]) for conta in contas
        ],
        donos=[_dono(dono_id, nome, linhas) for dono_id, nome in _donos(db, ctx)],
    )


def _conta(
    conta: Conta, linhas: list[Linha], atual: Decimal, previsto: Decimal
) -> BalancoConta:
    resumo = totalizar([linha for linha in linhas if linha.conta_id == conta.id])
    return BalancoConta(
        conta_id=conta.id,
        nome=conta.nome,
        dono_usuario_id=conta.usuario_id,
        entradas=par_saida(resumo.entradas),
        saidas=par_saida(resumo.saidas),
        transferencias_entrada=par_saida(
            _transferencias(linha for linha in linhas if linha.conta_destino_id == conta.id)
        ),
        transferencias_saida=par_saida(
            _transferencias(linha for linha in linhas if linha.conta_id == conta.id)
        ),
        saldo=par_saida(resumo.saldo),
        saldo_atual=para_str(atual),
        saldo_previsto=para_str(previsto),
    )


def _transferencias(linhas: Iterable[Linha]) -> ParValor:
    ligadas = [linha for linha in linhas if linha.classe in _CLASSES_TRANSFERENCIA]
    return ParValor(
        previsto=sum((linha.valor for linha in ligadas), _ZERO),
        realizado=sum((linha.valor for linha in ligadas if linha.realizada), _ZERO),
    )


def _dono(dono_id: int | None, nome: str, linhas: list[Linha]) -> DonoBalanco:
    resumo = totalizar([linha for linha in linhas if linha.dono == dono_id])
    return DonoBalanco(
        dono_usuario_id=dono_id,
        nome=nome,
        entradas=par_saida(resumo.entradas),
        saidas=par_saida(resumo.saidas),
        saldo=par_saida(resumo.saldo),
    )


def _donos(db: Session, ctx: Contexto) -> list[tuple[int | None, str]]:
    if ctx.casal_ativo_id is None:
        return [(ctx.usuario_id, db.get(Usuario, ctx.usuario_id).nome)]
    casal = db.get(Casal, ctx.casal_ativo_id)
    return [
        (casal.pessoa_a_id, db.get(Usuario, casal.pessoa_a_id).nome),
        (casal.pessoa_b_id, db.get(Usuario, casal.pessoa_b_id).nome),
        (None, "Casal"),
    ]
