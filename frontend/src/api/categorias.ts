import { cliente } from './cliente'

export type TipoCategoria = 'despesa' | 'receita'

type CategoriaBase = {
  id: number
  nome: string
  tipo: TipoCategoria
  icone: string
  cor: string
  fixa: boolean
  arquivado: boolean
  categoria_pai_id: number | null
}

export type CategoriaSaida = CategoriaBase & {
  subcategorias: CategoriaBase[]
}

export type CategoriaCriacao = {
  tipo: TipoCategoria
  nome: string
  icone: string
  cor?: string
  categoria_pai_id?: number
}

export type CategoriaEdicao = {
  nome?: string
  icone?: string
  cor?: string
}

export type TagSaida = { id: number; nome: string }

export type TagEntrada = { nome: string }

function consulta(params: Record<string, string | boolean | undefined>): string {
  const q = new URLSearchParams()
  for (const [chave, valor] of Object.entries(params)) {
    if (valor !== undefined) q.set(chave, String(valor))
  }
  const texto = q.toString()
  return texto ? `?${texto}` : ''
}

export function listarCategorias(
  filtros: { tipo?: TipoCategoria; incluir_arquivadas?: boolean } = {},
): Promise<CategoriaSaida[]> {
  return cliente.get<CategoriaSaida[]>(`/api/categorias${consulta(filtros)}`)
}

export function criarCategoria(corpo: CategoriaCriacao): Promise<CategoriaSaida> {
  return cliente.post<CategoriaSaida>('/api/categorias', corpo)
}

export function editarCategoria(id: number, corpo: CategoriaEdicao): Promise<CategoriaSaida> {
  return cliente.patch<CategoriaSaida>(`/api/categorias/${id}`, corpo)
}

export function arquivarCategoria(
  id: number,
  corpo: { mover_para_id?: number } = {},
): Promise<CategoriaSaida> {
  return cliente.post<CategoriaSaida>(`/api/categorias/${id}/arquivar`, corpo)
}

export function moverLancamentosCategoria(
  id: number,
  corpo: { destino_id: number },
): Promise<{ movidos: number }> {
  return cliente.post<{ movidos: number }>(`/api/categorias/${id}/mover-lancamentos`, corpo)
}

export function listarTags(): Promise<TagSaida[]> {
  return cliente.get<TagSaida[]>('/api/tags')
}

export function criarTag(corpo: TagEntrada): Promise<TagSaida> {
  return cliente.post<TagSaida>('/api/tags', corpo)
}

export function editarTag(id: number, corpo: TagEntrada): Promise<TagSaida> {
  return cliente.patch<TagSaida>(`/api/tags/${id}`, corpo)
}

export function excluirTag(id: number): Promise<void> {
  return cliente.del<void>(`/api/tags/${id}`)
}
