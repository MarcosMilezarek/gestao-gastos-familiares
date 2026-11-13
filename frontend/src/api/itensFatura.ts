import { cliente } from './cliente'
import type { FaturaSaida, ItemFaturaSaida } from './cartoes'
import type { Alcance } from '../componentes/DialogoAlcance'

export type CompraEntrada = {
  valor: string
  data: string
  descricao: string
  categoria_id: number
  fatura_mes?: string
  tag_ids?: number[]
  observacao?: string
  parcelas?: number
  recorrencia?: { modo: 'sem_fim' } | { modo: 'n_meses'; meses: number }
}

export type EstornoEntrada = {
  valor: string
  data: string
  descricao: string
  categoria_id: number
  fatura_mes?: string
  item_origem_id?: number
  tag_ids?: number[]
  observacao?: string
}

// Na edição todos os campos da criação são opcionais; `fatura_mes` e `item_origem_id` também.
export type ItemEdicao = Partial<CompraEntrada> & { item_origem_id?: number }

export type AjusteSaida = {
  item: ItemFaturaSaida | null
  fatura: FaturaSaida
}

function consulta(alcance?: Alcance): string {
  if (alcance === undefined) return ''
  return `?${new URLSearchParams({ alcance })}`
}

export function lancarCompra(cartaoId: number, corpo: CompraEntrada): Promise<ItemFaturaSaida> {
  return cliente.post<ItemFaturaSaida>(`/api/cartoes/${cartaoId}/compras`, corpo)
}

export function lancarEstorno(cartaoId: number, corpo: EstornoEntrada): Promise<ItemFaturaSaida> {
  return cliente.post<ItemFaturaSaida>(`/api/cartoes/${cartaoId}/estornos`, corpo)
}

export function ajustarFatura(cartaoId: number, mes: string, valorBanco: string): Promise<AjusteSaida> {
  return cliente.post<AjusteSaida>(`/api/cartoes/${cartaoId}/faturas/${mes}/ajuste`, {
    valor_banco: valorBanco,
  })
}

export function obterItem(id: number): Promise<ItemFaturaSaida> {
  return cliente.get<ItemFaturaSaida>(`/api/itens-fatura/${id}`)
}

export function editarItem(id: number, corpo: ItemEdicao, alcance?: Alcance): Promise<ItemFaturaSaida> {
  return cliente.patch<ItemFaturaSaida>(`/api/itens-fatura/${id}${consulta(alcance)}`, corpo)
}

export function excluirItem(id: number, alcance?: Alcance): Promise<void> {
  return cliente.del<void>(`/api/itens-fatura/${id}${consulta(alcance)}`)
}

export function pagarFatura(cartaoId: number, mes: string, data?: string): Promise<FaturaSaida> {
  return cliente.post<FaturaSaida>(`/api/cartoes/${cartaoId}/faturas/${mes}/pagamento`, { data })
}

export function confirmarPagamento(cartaoId: number, mes: string): Promise<FaturaSaida> {
  return cliente.post<FaturaSaida>(`/api/cartoes/${cartaoId}/faturas/${mes}/pagamento/confirmar`)
}

export function desfazerPagamento(cartaoId: number, mes: string): Promise<void> {
  return cliente.del<void>(`/api/cartoes/${cartaoId}/faturas/${mes}/pagamento`)
}
