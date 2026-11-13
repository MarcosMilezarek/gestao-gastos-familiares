import { cliente } from './cliente'

export type SubcategoriaSaida = {
  categoria_id: number
  nome: string
  arquivada: boolean
  limite: string
}

export type CategoriaSaida = {
  categoria_id: number
  nome: string
  icone: string
  cor: string
  arquivada: boolean
  limite: string
  por_subcategoria: boolean
  subcategorias: SubcategoriaSaida[]
}

export type ResumoSaida = {
  renda: string
  gastos_planejados: string
  balanco_planejado: string
  economia_planejada: string | null
}

export type OrcamentoSaida = {
  id: number | null
  mes: string | null
  renda: string
  percentual_economia: string
  orcamento_gastos: string
  economia: string
  categorias: CategoriaSaida[]
  total_categorizado: string
  falta_distribuir: string
  excedente: string
  resumo: ResumoSaida
}

export type OrcamentoMesSaida = {
  mes: string
  orcamento: OrcamentoSaida | null
  renda_sugerida: string
}

export type SubcategoriaEntrada = {
  categoria_id: number
  limite: string
}

// Cada categoria tem exatamente um entre limite e subcategorias (regra do back-end).
export type CategoriaEntrada = {
  categoria_id: number
  limite?: string
  subcategorias?: SubcategoriaEntrada[]
}

export type OrcamentoEntrada = {
  renda: string
  percentual_economia: string
  categorias: CategoriaEntrada[]
}

export type ComparacaoLinha = {
  categoria_id: number | null
  nome: string
  icone: string | null
  cor: string | null
  arquivada: boolean
  limite: string | null
  gasto: string
  restante: string | null
  consumo: string | null
  acima_do_limite: boolean
}

export type ComparacaoLinhaCategoria = ComparacaoLinha & {
  subcategorias: ComparacaoLinha[]
}

export type ComparacaoTotal = {
  planejado: string
  gasto: string
  restante: string | null
  consumo: string | null
  acima_do_limite: boolean
}

export type ComparacaoSaida = {
  mes: string
  linhas: ComparacaoLinhaCategoria[]
  total: ComparacaoTotal
}

export function obterOrcamento(mes: string): Promise<OrcamentoMesSaida> {
  return cliente.get<OrcamentoMesSaida>(`/api/orcamentos/${mes}`)
}

export function criarOrcamento(mes: string, corpo: OrcamentoEntrada): Promise<OrcamentoSaida> {
  return cliente.post<OrcamentoSaida>(`/api/orcamentos/${mes}`, corpo)
}

export function editarOrcamento(mes: string, corpo: OrcamentoEntrada): Promise<OrcamentoSaida> {
  return cliente.put<OrcamentoSaida>(`/api/orcamentos/${mes}`, corpo)
}

export function excluirOrcamento(mes: string): Promise<void> {
  return cliente.del<void>(`/api/orcamentos/${mes}`)
}

export function copiarDoAnterior(mes: string, substituir: boolean): Promise<OrcamentoSaida> {
  return cliente.post<OrcamentoSaida>(`/api/orcamentos/${mes}/copiar-do-anterior`, { substituir })
}

export function obterComparacao(mes: string): Promise<ComparacaoSaida> {
  return cliente.get<ComparacaoSaida>(`/api/orcamentos/${mes}/comparacao`)
}

export function previaOrcamento(corpo: OrcamentoEntrada): Promise<OrcamentoSaida> {
  return cliente.post<OrcamentoSaida>('/api/previa-orcamento', corpo)
}
