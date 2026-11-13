import { cliente } from './cliente'
import type { LancamentoSaida, SituacaoLancamento } from './lancamentos'
import type { FaturaResumo } from './cartoes'

export type Par = {
  previsto: string
  realizado: string
}

export type Resumo = {
  entradas: Par
  saidas: Par
  saldo: Par
}

export type ResumoLista = Resumo & {
  saldo_atual_total: string
}

export type ItemLancamentoLista = {
  kind: 'lancamento'
  lancamento: LancamentoSaida
  conta_nome: string | null
  conta_destino_nome: string | null
  rotulo: string
  meta: null | { id: number; nome: string }
}

export type ItemFaturaLista = {
  kind: 'fatura'
  data: string
  fatura: FaturaResumo
}

export type ItemLista = ItemLancamentoLista | ItemFaturaLista

export type DiaLista = {
  data: string
  itens: ItemLista[]
  saldo_fim_do_dia: string
}

export type ListaControle = {
  mes: string
  filtros_ativos: boolean
  resumo: ResumoLista
  dias: DiaLista[]
}

export type TipoLista =
  | 'despesa_conta'
  | 'receita'
  | 'despesa_cartao'
  | 'transferencia'
  | 'aporte'
  | 'aplicacao_resgate'
  | 'reajuste'

export type BalancoConta = {
  conta_id: number
  nome: string
  dono_usuario_id: number | null
  entradas: Par
  saidas: Par
  transferencias_entrada: Par
  transferencias_saida: Par
  saldo: Par
  saldo_atual: string
  saldo_previsto: string
}

export type DonoBalanco = {
  dono_usuario_id: number | null
  nome: string
  entradas: Par
  saidas: Par
  saldo: Par
}

export type BalancoMes = {
  mes: string
  total: Resumo
  contas: BalancoConta[]
  donos: DonoBalanco[]
}

// Cada parâmetro é repetível; vazio ou ausente não entra na consulta.
export type FiltrosControle = {
  dono?: (number | 'casal')[]
  conta_id?: number[]
  categoria_id?: number[]
  tipo?: TipoLista[]
  cartao_id?: number[]
  situacao?: SituacaoLancamento[]
}

export function obterLista(mes: string, filtros: FiltrosControle = {}): Promise<ListaControle> {
  const consulta = new URLSearchParams({ mes })
  for (const [chave, valores] of Object.entries(filtros)) {
    for (const valor of valores ?? []) consulta.append(chave, String(valor))
  }
  return cliente.get<ListaControle>(`/api/controle/lista?${consulta}`)
}

export function obterBalanco(mes: string): Promise<BalancoMes> {
  return cliente.get<BalancoMes>(`/api/balanco?${new URLSearchParams({ mes })}`)
}
