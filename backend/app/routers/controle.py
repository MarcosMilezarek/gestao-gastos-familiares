from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.acesso import Contexto
from app.deps import DbSessao, get_contexto
from app.schemas.controle import ListaControle, filtro_dos_parametros
from app.services.lista_controle import listar
from app.tempo import hoje, mes_ref, validar_mes

router = APIRouter(prefix="/api")

ContextoAtual = Annotated[Contexto, Depends(get_contexto)]
ParametrosLista = Annotated[list[str] | None, Query()]


@router.get("/controle/lista", response_model=ListaControle)
def obter_lista(
    ctx: ContextoAtual,
    db: DbSessao,
    mes: str | None = None,
    dono: ParametrosLista = None,
    conta_id: ParametrosLista = None,
    categoria_id: ParametrosLista = None,
    tipo: ParametrosLista = None,
    cartao_id: ParametrosLista = None,
    situacao: ParametrosLista = None,
) -> ListaControle:
    mes_consulta = mes_ref(hoje()) if mes is None else validar_mes(mes, hoje())
    filtro = filtro_dos_parametros(
        dono or [],
        conta_id or [],
        categoria_id or [],
        tipo or [],
        cartao_id or [],
        situacao or [],
    )
    return listar(db, ctx, mes_consulta, filtro)
