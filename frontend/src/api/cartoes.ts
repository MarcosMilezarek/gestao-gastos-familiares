import { cliente } from './cliente'
import type { TagSaida } from './categorias'

export type FaturaStatus = 'aberta' | 'fechada' | 'vencida' | 'zerada' | 'paga'

export type CartaoSaida = {
  id: number
  nome: string
  conta_id: number
  dono_usuario_id: number | null
  limite: string
  dia_fechamento: number
  dia_vencimento: number
  bandeira: string | null
  conta_arquivada: boolean
  limite_usado: string
  limite_disponivel: string
  uso_porcentagem: string | null
  fatura_corrente: FaturaResumo
}

export type FaturaResumo = {
  cartao_id: number
  cartao_nome: string
  conta_id: number
  mes: string
  id: number | null
  status: FaturaStatus
  fechamento: string
  vencimento: string
  valor: string
  pagamento: null | {
    lancamento_id: number
    data: string
    situacao: 'confirmada' | 'prevista'
    valor: string
  }
}

export type ItemFaturaSaida = {
  id: number
  tipo: 'compra' | 'estorno' | 'ajuste'
  valor: string
  data: string
  descricao: string
  descricao_base: string
  categoria: null | {
    id: number
    nome: string
    pai_nome: string | null
    cor: string
    icone: string
  }
  tags: TagSaida[]
  observacao: string | null
  serie: null | { id: number; tipo: 'parcelada' | 'recorrente'; numero: number; total: number | null }
  item_origem_id: number | null
  fatura_mes: string
  fatura_paga: boolean
  criado_por: { id: number; nome: string }
}

export type FaturaSaida = FaturaResumo & {
  bruto: string
  credito_recebido: string
  credito_repassado: string
  itens: ItemFaturaSaida[]
  conta_arquivada: boolean
  pode_pagar: boolean
  editavel: boolean
}

export type ListaCartoes = {
  cartoes: CartaoSaida[]
  limite_disponivel_total: string | null
  total_faturas_mes: string | null
}

export type ListaFaturas = {
  sugerida: string | null
  faturas: FaturaResumo[]
}

export type CartaoEntrada = {
  nome: string
  conta_id: number
  limite: string
  dia_fechamento: number
  dia_vencimento: number
  bandeira?: string
}

// Na edição a conta dona não muda: `conta_id` fica de fora. Bandeira apagada vai como `null`.
export type CartaoEdicao = Partial<Omit<CartaoEntrada, 'conta_id' | 'bandeira'>> & {
  bandeira?: string | null
}

export function listarCartoes(filtros: { arquivadas?: boolean } = {}): Promise<ListaCartoes> {
  const consulta = new URLSearchParams()
  if (filtros.arquivadas !== undefined) consulta.set('arquivadas', String(filtros.arquivadas))
  const texto = consulta.toString()
  return cliente.get<ListaCartoes>(`/api/cartoes${texto ? `?${texto}` : ''}`)
}

export function obterCartao(id: number): Promise<CartaoSaida> {
  return cliente.get<CartaoSaida>(`/api/cartoes/${id}`)
}

export function criarCartao(corpo: CartaoEntrada): Promise<CartaoSaida> {
  return cliente.post<CartaoSaida>('/api/cartoes', corpo)
}

export function editarCartao(id: number, corpo: CartaoEdicao): Promise<CartaoSaida> {
  return cliente.patch<CartaoSaida>(`/api/cartoes/${id}`, corpo)
}

export function excluirCartao(id: number): Promise<void> {
  return cliente.del<void>(`/api/cartoes/${id}`)
}

export function listarFaturas(
  cartaoId: number,
  filtros: { de?: string; ate?: string; data?: string } = {},
): Promise<ListaFaturas> {
  const consulta = new URLSearchParams()
  if (filtros.de !== undefined) consulta.set('de', filtros.de)
  if (filtros.ate !== undefined) consulta.set('ate', filtros.ate)
  if (filtros.data !== undefined) consulta.set('data', filtros.data)
  const texto = consulta.toString()
  return cliente.get<ListaFaturas>(`/api/cartoes/${cartaoId}/faturas${texto ? `?${texto}` : ''}`)
}

export function obterFatura(cartaoId: number, mes: string): Promise<FaturaSaida> {
  return cliente.get<FaturaSaida>(`/api/cartoes/${cartaoId}/faturas/${mes}`)
}
