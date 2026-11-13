import { cliente } from './cliente'

export type ProporcaoSaida = {
  mes: string
  base_despesas_casal: string
  origem_porcentagem: 'mes' | 'herdada' | 'padrao_50_50'
  mes_origem: string | null
  pessoas: {
    usuario_id: number
    nome: string
    porcentagem: string
    devido: string
    aportado: string
    faltante: string
    excedente: string
  }[]
}

export function obterProporcao(mes?: string): Promise<ProporcaoSaida> {
  const consulta = mes === undefined ? '' : `?${new URLSearchParams({ mes })}`
  return cliente.get<ProporcaoSaida>(`/api/proporcao${consulta}`)
}

export function sugestaoAporte(filtros: {
  conta_origem_id: number
  data: string
}): Promise<{ valor: string | null }> {
  const consulta = new URLSearchParams({
    conta_origem_id: String(filtros.conta_origem_id),
    data: filtros.data,
  })
  return cliente.get<{ valor: string | null }>(`/api/proporcao/sugestao-aporte?${consulta}`)
}
