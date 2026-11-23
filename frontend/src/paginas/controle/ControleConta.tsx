import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { ApiError } from '../../api/cliente'
import { obterConta } from '../../api/contas'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { SeletorMes } from '../../componentes/SeletorMes'
import { useMes } from '../../hooks/useMes'
import { ListaDoMes } from './Controle'

export function ControleConta() {
  const { contaId } = useParams()
  const id = Number(contaId)
  const { mes, setMes } = useMes()

  const consulta = useQuery({
    queryKey: ['contas', id, mes],
    queryFn: () => obterConta(id, mes),
    enabled: mes !== '' && Number.isInteger(id),
  })
  const conta = consulta.data

  if (!Number.isInteger(id)) {
    return (
      <div className="flex flex-col gap-4 px-4 pb-4">
        <p role="alert" className="m-0 text-saida-texto">
          Conta não encontrada.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-4">
      <SeletorMes mes={mes} onMudar={setMes} />
      <CabecalhoTela titulo={conta?.nome ?? ''} voltarPara="/controle/contas" />

      {consulta.isError && (
        <p role="alert" className="m-0 text-saida-texto">
          {consulta.error instanceof ApiError
            ? consulta.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {!conta && !consulta.isError && <p className="m-0 text-muted-foreground">Carregando…</p>}

      {conta && <ListaDoMes mes={mes} contaId={id} podeEscrever={!conta.arquivado} />}
    </div>
  )
}
