import { cliente } from './cliente'
import type { LancamentoSaida } from './lancamentos'

export type TipoConta =
  | 'conta_corrente'
  | 'dinheiro'
  | 'poupanca'
  | 'investimentos'
  | 'vr_va'
  | 'outros'

export type ContaSaida = {
  id: number
  nome: string
  instituicao: string | null
  tipo: TipoConta
  cor: string
  saldo_inicial: string
  dono_usuario_id: number | null
  arquivado: boolean
  casal_encerrado: boolean
  saldo_atual: string
  saldo_previsto: string
}

export type ListagemContas = {
  mes: string
  contas: ContaSaida[]
  total_saldo_atual: string | null
  total_saldo_previsto: string | null
}

export type ContaEdicao = {
  nome?: string
  instituicao?: string | null
  tipo?: TipoConta
  cor?: string
  saldo_inicial?: string
}

export type RetornoReajuste = {
  conta: ContaSaida
  lancamento: LancamentoSaida | null
}

function consulta(params: Record<string, string | boolean | undefined>): string {
  const q = new URLSearchParams()
  for (const [chave, valor] of Object.entries(params)) {
    if (valor !== undefined) q.set(chave, String(valor))
  }
  const texto = q.toString()
  return texto ? `?${texto}` : ''
}

export function listarContas(
  filtros: { mes?: string; arquivadas?: boolean } = {},
): Promise<ListagemContas> {
  return cliente.get<ListagemContas>(`/api/contas${consulta(filtros)}`)
}

export function obterConta(id: number, mes?: string): Promise<ContaSaida> {
  return cliente.get<ContaSaida>(`/api/contas/${id}${consulta({ mes })}`)
}

export function editarConta(id: number, corpo: ContaEdicao): Promise<ContaSaida> {
  return cliente.patch<ContaSaida>(`/api/contas/${id}`, corpo)
}

export function arquivarConta(id: number): Promise<ContaSaida> {
  return cliente.post<ContaSaida>(`/api/contas/${id}/arquivar`)
}

export function desarquivarConta(id: number): Promise<ContaSaida> {
  return cliente.post<ContaSaida>(`/api/contas/${id}/desarquivar`)
}

export function reajustarConta(id: number, corpo: { saldo_real: string }): Promise<RetornoReajuste> {
  return cliente.post<RetornoReajuste>(`/api/contas/${id}/reajuste`, corpo)
}
