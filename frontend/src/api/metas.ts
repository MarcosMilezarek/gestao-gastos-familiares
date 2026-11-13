import { cliente } from './cliente'
import type { LancamentoSaida } from './lancamentos'

export type MetaSaida = {
  id: number
  nome: string
  valor_alvo: string
  data_alvo: string | null
  valor_inicial: string
  cor: string
  icone: string
  descricao: string | null
  valor_atual: string
  aplicado_liquido: string
  rendeu: string
  falta: string
  porcentagem: string
  situacao: 'em_andamento' | 'concluida'
  casal_encerrado: boolean
}

export type MetasSaida = {
  patrimonio_total: string
  metas: MetaSaida[]
}

export type MovimentoMeta = {
  tipo: 'inicial' | 'aplicacao' | 'resgate' | 'rendimento'
  id: number | null
  data: string
  valor: string
  situacao: 'confirmada' | 'prevista' | 'atrasada' | null
  descricao: string | null
}

export type MetaDetalhe = MetaSaida & {
  movimentos: MovimentoMeta[]
}

export type RendimentoSaida = {
  id: number
  meta_id: number
  data: string
  valor: string
}

export type RendimentoResultado = {
  rendimento: RendimentoSaida | null
  meta: MetaSaida
}

export type MetaEntrada = {
  nome: string
  valor_alvo: string
  data_alvo?: string
  valor_inicial?: string
  cor: string
  icone: string
  descricao?: string
}

// data_alvo e descricao aceitam null (remove o valor); os demais não.
export type MetaEdicao = Partial<Omit<MetaEntrada, 'data_alvo' | 'descricao'>> & {
  data_alvo?: string | null
  descricao?: string | null
}

export type MovimentoEntrada = {
  valor: string
  data: string
  descricao?: string
  situacao?: 'prevista' | 'confirmada'
}

export type RendimentoEntrada = {
  valor_atual: string
}

export type RendimentoEdicao = {
  valor?: string
  data?: string
}

// Edição de aplicação ou resgate: descricao aceita null (remove o texto), o que
// LancamentoEdicao não aceita; por isso a chamada não reutiliza editarLancamento.
export type MovimentoEdicao = {
  valor?: string
  data?: string
  descricao?: string | null
  situacao?: 'prevista' | 'confirmada'
}

export function listarMetas(): Promise<MetasSaida> {
  return cliente.get<MetasSaida>('/api/metas')
}

export function criarMeta(corpo: MetaEntrada): Promise<MetaSaida> {
  return cliente.post<MetaSaida>('/api/metas', corpo)
}

export function obterMeta(id: number): Promise<MetaDetalhe> {
  return cliente.get<MetaDetalhe>(`/api/metas/${id}`)
}

export function editarMeta(id: number, corpo: MetaEdicao): Promise<MetaSaida> {
  return cliente.patch<MetaSaida>(`/api/metas/${id}`, corpo)
}

export function excluirMeta(id: number): Promise<void> {
  return cliente.del<void>(`/api/metas/${id}`)
}

export function aplicar(id: number, corpo: MovimentoEntrada): Promise<LancamentoSaida> {
  return cliente.post<LancamentoSaida>(`/api/metas/${id}/aplicacoes`, corpo)
}

export function resgatar(id: number, corpo: MovimentoEntrada): Promise<LancamentoSaida> {
  return cliente.post<LancamentoSaida>(`/api/metas/${id}/resgates`, corpo)
}

export function registrarRendimento(
  id: number,
  corpo: RendimentoEntrada,
): Promise<RendimentoResultado> {
  return cliente.post<RendimentoResultado>(`/api/metas/${id}/rendimentos`, corpo)
}

export function editarRendimento(
  id: number,
  rendimentoId: number,
  corpo: RendimentoEdicao,
): Promise<RendimentoSaida> {
  return cliente.patch<RendimentoSaida>(`/api/metas/${id}/rendimentos/${rendimentoId}`, corpo)
}

export function excluirRendimento(id: number, rendimentoId: number): Promise<void> {
  return cliente.del<void>(`/api/metas/${id}/rendimentos/${rendimentoId}`)
}

export function editarMovimento(id: number, corpo: MovimentoEdicao): Promise<LancamentoSaida> {
  return cliente.patch<LancamentoSaida>(`/api/lancamentos/${id}`, corpo)
}
