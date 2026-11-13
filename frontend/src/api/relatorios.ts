import { cliente } from './cliente'
import type { ProporcaoSaida } from './proporcao'

type Par = {
  previsto: string
  realizado: string
}

export type SubcategoriaRelatorio = {
  categoria_id: number
  nome: string
  icone: string
  cor: string
  valor: string
  valor_direto: string
  porcentagem: string
}

export type CategoriaRelatorio = {
  categoria_id: number | null
  nome: string
  icone: string | null
  cor: string | null
  valor: string
  valor_direto: string
  porcentagem: string
  subcategorias: SubcategoriaRelatorio[]
}

export type RelatorioCategorias = {
  mes: string
  total: string
  categorias: CategoriaRelatorio[]
}

export type ItemDonoRelatorio = {
  dono_usuario_id: number | null
  nome: string
  valor: string
  porcentagem: string
}

export type RelatorioDono = {
  mes: string
  total: string
  itens: ItemDonoRelatorio[]
}

export type ItemContaRelatorio = {
  conta_id: number
  nome: string
  valor: string
  porcentagem: string
}

export type RelatorioConta = {
  mes: string
  total: string
  itens: ItemContaRelatorio[]
}

export type MesBalancoRelatorio = {
  mes: string
  entradas: Par
  saidas: Par
  saldo: Par
}

export type RelatorioBalancoMensal = {
  meses: MesBalancoRelatorio[]
}

export type RelatorioProporcao = {
  meses: ProporcaoSaida[]
}

function consultaMes(mes?: string): string {
  return mes === undefined ? '' : `?${new URLSearchParams({ mes })}`
}

export function obterRelatorioCategorias(mes?: string): Promise<RelatorioCategorias> {
  return cliente.get<RelatorioCategorias>(
    `/api/relatorios/despesas-por-categoria${consultaMes(mes)}`,
  )
}

export function obterRelatorioDono(mes?: string): Promise<RelatorioDono> {
  return cliente.get<RelatorioDono>(`/api/relatorios/despesas-por-dono${consultaMes(mes)}`)
}

export function obterRelatorioConta(mes?: string): Promise<RelatorioConta> {
  return cliente.get<RelatorioConta>(`/api/relatorios/despesas-por-conta${consultaMes(mes)}`)
}

export function obterRelatorioBalancoMensal(mes?: string): Promise<RelatorioBalancoMensal> {
  return cliente.get<RelatorioBalancoMensal>(
    `/api/relatorios/balanco-mensal${consultaMes(mes)}`,
  )
}

export function obterRelatorioProporcao(mes?: string): Promise<RelatorioProporcao> {
  return cliente.get<RelatorioProporcao>(`/api/relatorios/proporcao${consultaMes(mes)}`)
}
