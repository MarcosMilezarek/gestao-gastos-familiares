import { cliente } from './cliente'
import type { BalancoConta, ItemLista } from './controle'
import type { FaturaResumo } from './cartoes'
import type { ProjecaoSaida } from './projecao'
import type { ProporcaoSaida } from './proporcao'
import type { RelatorioCategorias } from './relatorios'

export type SaldoCardInicio = {
  conta_id: number
  nome: string
  dono_usuario_id: number | null
  saldo_atual: string
}

export type InicioSaida = {
  mes: string
  hoje: string
  cards: {
    saldos: SaldoCardInicio[]
    total_faturas_mes: string
  }
  proporcao: ProporcaoSaida | null
  pendentes: ItemLista[]
  despesas_por_categoria: RelatorioCategorias
  balanco_contas: BalancoConta[]
  proximas_faturas: FaturaResumo[]
  projecao: ProjecaoSaida
}

export function obterInicio(): Promise<InicioSaida> {
  return cliente.get<InicioSaida>('/api/inicio')
}
