import { cliente } from './cliente'

export type HorizonteProjecao = 3 | 6 | 12

export type ProjecaoMes = {
  mes: string
  previsto: boolean
  entradas: string
  saidas: string
  transferencias_entrada: string
  transferencias_saida: string
  pagamentos_fatura: string
  aplicacoes_menos_resgates: string
  saldo_previsto: string
}

export type ProjecaoSaida = {
  conta_id: number | null
  horizonte: number
  meses: ProjecaoMes[]
}

export function obterProjecao(
  filtros: { horizonte?: HorizonteProjecao; conta_id?: number } = {},
): Promise<ProjecaoSaida> {
  const consulta = new URLSearchParams()
  if (filtros.horizonte !== undefined) consulta.set('horizonte', String(filtros.horizonte))
  if (filtros.conta_id !== undefined) consulta.set('conta_id', String(filtros.conta_id))
  const texto = consulta.toString()
  return cliente.get<ProjecaoSaida>(`/api/projecao${texto === '' ? '' : `?${texto}`}`)
}
