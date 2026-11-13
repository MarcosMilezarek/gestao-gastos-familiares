import { cliente } from './cliente'
import type { TagSaida } from './categorias'
import type { Alcance } from '../componentes/DialogoAlcance'

export type TipoLancamento =
  | 'despesa'
  | 'receita'
  | 'transferencia'
  | 'reajuste'
  | 'aplicacao'
  | 'resgate'

export type SituacaoLancamento = 'confirmada' | 'prevista' | 'atrasada'

export type LancamentoSaida = {
  id: number
  tipo: TipoLancamento
  valor: string
  data: string
  situacao: SituacaoLancamento
  descricao: string | null
  categoria: null | {
    id: number
    nome: string
    pai_nome: string | null
    cor: string
    icone: string
  }
  dono_usuario_id: number | null
  conta_id: number
  conta_destino_id: number | null
  aporte: boolean
  tags: TagSaida[]
  observacao: string | null
  criado_por: { id: number; nome: string }
  criado_em: string
  recorrente: boolean
  recorrencia_id: number | null
  numero_recorrencia: number | null
  total_ocorrencias: number | null
  meta: null | { id: number; nome: string }
}

type LancamentoBase = {
  valor: string
  data: string
  situacao?: 'prevista' | 'confirmada'
  descricao?: string
  tag_ids?: number[]
  observacao?: string
  recorrencia?: { modo: 'sem_fim' } | { modo: 'n_meses'; meses: number }
}

export type LancamentoDespesaReceita = LancamentoBase & {
  tipo: 'despesa' | 'receita'
  descricao: string
  categoria_id: number
  dono_usuario_id: number | null
  conta_id: number
}

export type LancamentoTransferencia = LancamentoBase & {
  tipo: 'transferencia'
  conta_id: number
  conta_destino_id: number
}

export type LancamentoEntrada = LancamentoDespesaReceita | LancamentoTransferencia

// Na edição o tipo não muda; todos os campos da criação são opcionais.
export type LancamentoEdicao = Partial<
  Omit<LancamentoDespesaReceita, 'tipo'> & Omit<LancamentoTransferencia, 'tipo'>
>

function consulta(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams()
  for (const [chave, valor] of Object.entries(params)) {
    if (valor !== undefined) q.set(chave, String(valor))
  }
  const texto = q.toString()
  return texto ? `?${texto}` : ''
}

export function listarLancamentos(
  filtros: { mes?: string; conta_id?: number } = {},
): Promise<LancamentoSaida[]> {
  return cliente.get<LancamentoSaida[]>(`/api/lancamentos${consulta(filtros)}`)
}

export function obterLancamento(id: number): Promise<LancamentoSaida> {
  return cliente.get<LancamentoSaida>(`/api/lancamentos/${id}`)
}

export function criarLancamento(corpo: LancamentoEntrada): Promise<LancamentoSaida> {
  return cliente.post<LancamentoSaida>('/api/lancamentos', corpo)
}

export function editarLancamento(
  id: number,
  corpo: LancamentoEdicao,
  alcance?: Alcance,
): Promise<LancamentoSaida> {
  return cliente.patch<LancamentoSaida>(`/api/lancamentos/${id}${consulta({ alcance })}`, corpo)
}

export function excluirLancamento(id: number, alcance?: Alcance): Promise<void> {
  return cliente.del<void>(`/api/lancamentos/${id}${consulta({ alcance })}`)
}

export function confirmarLancamento(
  id: number,
  corpo: { valor?: string } = {},
): Promise<LancamentoSaida> {
  return cliente.post<LancamentoSaida>(`/api/lancamentos/${id}/confirmar`, corpo)
}
