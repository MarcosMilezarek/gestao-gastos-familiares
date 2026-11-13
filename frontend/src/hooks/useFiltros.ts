import { useSearchParams } from 'react-router'
import type { FiltrosControle, TipoLista } from '../api/controle'
import type { SituacaoLancamento } from '../api/lancamentos'

export type ChaveFiltro = keyof FiltrosControle
export type AtalhoTipo = 'todas' | 'despesas' | 'receitas' | 'transferencias'
// Escolhas ainda não gravadas na URL (sheet de filtros).
export type Rascunho = Partial<Record<ChaveFiltro, ReadonlyArray<string | number>>>

const CHAVES: ChaveFiltro[] = [
  'dono',
  'conta_id',
  'categoria_id',
  'tipo',
  'cartao_id',
  'situacao',
]
const TIPOS: TipoLista[] = [
  'despesa_conta',
  'receita',
  'despesa_cartao',
  'transferencia',
  'aporte',
  'aplicacao_resgate',
  'reajuste',
]
const SITUACOES: SituacaoLancamento[] = ['confirmada', 'prevista', 'atrasada']
const INTEIRO_POSITIVO = /^[1-9]\d*$/

// RF-5.10: cada atalho é um conjunto de `tipo`; "Todas" não tem `tipo`.
const ATALHOS: Record<AtalhoTipo, TipoLista[]> = {
  todas: [],
  despesas: ['despesa_conta', 'despesa_cartao'],
  receitas: ['receita'],
  transferencias: ['transferencia', 'aporte'],
}

// Valor fora do esperado vira undefined e sai da lista; não quebra a tela.
function filtrar<T>(valores: string[], converter: (v: string) => T | undefined): T[] {
  return valores.flatMap((v) => {
    const convertido = converter(v)
    return convertido === undefined ? [] : [convertido]
  })
}

function lerId(v: string): number | undefined {
  return INTEIRO_POSITIVO.test(v) ? Number(v) : undefined
}

function lerDono(v: string): 'casal' | number | undefined {
  return v === 'casal' ? 'casal' : lerId(v)
}

function lerTipo(v: string): TipoLista | undefined {
  return TIPOS.find((t) => t === v)
}

function lerSituacao(v: string): SituacaoLancamento | undefined {
  return SITUACOES.find((s) => s === v)
}

function lerFiltros(params: URLSearchParams): FiltrosControle {
  return {
    dono: filtrar(params.getAll('dono'), lerDono),
    conta_id: filtrar(params.getAll('conta_id'), lerId),
    categoria_id: filtrar(params.getAll('categoria_id'), lerId),
    tipo: filtrar(params.getAll('tipo'), lerTipo),
    cartao_id: filtrar(params.getAll('cartao_id'), lerId),
    situacao: filtrar(params.getAll('situacao'), lerSituacao),
  }
}

function atalhoDe(tipos: TipoLista[]): AtalhoTipo | null {
  if (tipos.length === 0) return 'todas'
  const conjunto = new Set(tipos)
  const achado = (Object.keys(ATALHOS) as AtalhoTipo[]).find(
    (a) =>
      ATALHOS[a].length === conjunto.size && ATALHOS[a].every((t) => conjunto.has(t)),
  )
  return achado ?? null
}

// Filtros na URL (além de `mes`, que é de useMes e não é tocado aqui).
// Mudanças usam replace: trocar um filtro não polui o histórico do navegador.
export function useFiltros() {
  const [params, setParams] = useSearchParams()

  const filtros = lerFiltros(params)
  const ativos = CHAVES.some((c) => (filtros[c]?.length ?? 0) > 0)
  const atalho = atalhoDe(filtros.tipo ?? [])

  function mudar(chave: ChaveFiltro, valores: ReadonlyArray<string | number>) {
    setParams(
      (atual) => {
        const novo = new URLSearchParams(atual)
        novo.delete(chave)
        for (const valor of valores) novo.append(chave, String(valor))
        return novo
      },
      { replace: true },
    )
  }

  function escolherAtalho(a: AtalhoTipo) {
    mudar('tipo', ATALHOS[a])
  }

  function limpar() {
    setParams(
      (atual) => {
        const novo = new URLSearchParams(atual)
        for (const chave of CHAVES) novo.delete(chave)
        return novo
      },
      { replace: true },
    )
  }

  // "Aplicar" do sheet: todos os filtros numa só gravação.
  function aplicar(rascunho: Rascunho) {
    setParams(
      (atual) => {
        const novo = new URLSearchParams(atual)
        for (const chave of CHAVES) {
          novo.delete(chave)
          for (const valor of rascunho[chave] ?? []) novo.append(chave, String(valor))
        }
        return novo
      },
      { replace: true },
    )
  }

  return { filtros, ativos, atalho, mudar, escolherAtalho, limpar, aplicar }
}

export type ControleFiltros = ReturnType<typeof useFiltros>
