import { cliente } from './cliente'

export type PlanoMetaSaida = {
  meses: number
  aplicacao_mensal: string
  total_a_aplicar: string
  atingida: boolean
}

export type PlanoMetaConsulta = {
  valor_alvo: string
  valor_atual: string
  mes_alvo: string
}

// Só leitura: nada é salvo. Dinheiro vai como string no parâmetro.
export function calcularPlano(consulta: PlanoMetaConsulta): Promise<PlanoMetaSaida> {
  const parametros = new URLSearchParams(consulta)
  return cliente.get<PlanoMetaSaida>(`/api/plano-de-metas/calculo?${parametros}`)
}
