import { cliente } from './cliente'

export type CenarioResumo = {
  id: number
  nome: string
  total_rendas: string
  total_despesas: string
  saldo_mensal: string
}

export type ItemSaida = {
  id: number
  tipo: 'renda' | 'despesa'
  dono_usuario_id: number | null
  dono_nome: string
  descricao: string
  valor: string
}

export type PessoaResultado = {
  usuario_id: number
  nome: string
  renda: string
  porcentagem: string | null
  aporte: string | null
  despesas_proprias: string
  sobra: string | null
}

export type ResultadoSaida = {
  total_rendas: string
  total_despesas: string
  saldo_mensal: string
  sem_proporcao: boolean
  base_casal: string
  pessoas: PessoaResultado[]
}

export type CenarioSaida = {
  id: number
  nome: string
  itens: ItemSaida[]
  resultado: ResultadoSaida
}

export type CenarioEntrada = {
  nome: string
}

export type CenarioEdicao = {
  nome: string
}

export type ItemEntrada = {
  tipo: 'renda' | 'despesa'
  dono_usuario_id?: number | null
  descricao: string
  valor: string
}

// tipo não muda, então não está aqui. dono_usuario_id null vale para despesa (casal);
// para renda, a API responde 422.
export type ItemEdicao = {
  dono_usuario_id?: number | null
  descricao?: string
  valor?: string
}

export function listarCenarios(): Promise<CenarioResumo[]> {
  return cliente.get<CenarioResumo[]>('/api/cenarios')
}

export function criarCenario(corpo: CenarioEntrada): Promise<CenarioSaida> {
  return cliente.post<CenarioSaida>('/api/cenarios', corpo)
}

export function obterCenario(id: number): Promise<CenarioSaida> {
  return cliente.get<CenarioSaida>(`/api/cenarios/${id}`)
}

export function editarCenario(id: number, corpo: CenarioEdicao): Promise<CenarioSaida> {
  return cliente.patch<CenarioSaida>(`/api/cenarios/${id}`, corpo)
}

export function excluirCenario(id: number): Promise<void> {
  return cliente.del<void>(`/api/cenarios/${id}`)
}

export function adicionarItemCenario(id: number, corpo: ItemEntrada): Promise<CenarioSaida> {
  return cliente.post<CenarioSaida>(`/api/cenarios/${id}/itens`, corpo)
}

export function editarItemCenario(
  id: number,
  itemId: number,
  corpo: ItemEdicao,
): Promise<CenarioSaida> {
  return cliente.patch<CenarioSaida>(`/api/cenarios/${id}/itens/${itemId}`, corpo)
}

// Devolve o cenário já recalculado (200, D9), não 204.
export function excluirItemCenario(id: number, itemId: number): Promise<CenarioSaida> {
  return cliente.del<CenarioSaida>(`/api/cenarios/${id}/itens/${itemId}`)
}
