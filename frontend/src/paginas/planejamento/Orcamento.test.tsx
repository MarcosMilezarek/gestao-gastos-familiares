import { afterEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { CategoriaSaida as CategoriaCadastro } from '../../api/categorias'
import type {
  ComparacaoLinhaCategoria,
  ComparacaoSaida,
  OrcamentoEntrada,
  OrcamentoSaida,
} from '../../api/orcamentos'
import { erroApi, json, limparTudo, renderizarApp, simularApi } from '../../testes/utilitarios'
import type { Chamada, Resposta } from '../../testes/utilitarios'

afterEach(limparTudo)

// ---------- Fixtures ----------

function cadastro(id: number, nome: string, extra: Partial<CategoriaCadastro> = {}): CategoriaCadastro {
  return {
    id,
    nome,
    tipo: 'despesa',
    icone: 'home',
    cor: '#336699',
    fixa: false,
    arquivado: false,
    categoria_pai_id: null,
    subcategorias: [],
    ...extra,
  }
}

function sub(id: number, nome: string, pai: number, arquivado = false) {
  return { id, nome, tipo: 'despesa' as const, icone: 'home', cor: '#336699', fixa: false, arquivado, categoria_pai_id: pai }
}

const CATEGORIAS: CategoriaCadastro[] = [
  cadastro(10, 'Moradia', { subcategorias: [sub(11, 'Aluguel', 10), sub(12, 'Condomínio', 10)] }),
  cadastro(20, 'Mercado'),
  cadastro(30, 'Lazer', { arquivado: true }),
]

function cat(id: number, nome: string, limite: string, extra: Partial<OrcamentoSaida['categorias'][number]> = {}) {
  return {
    categoria_id: id,
    nome,
    icone: 'home',
    cor: '#336699',
    arquivada: false,
    limite,
    por_subcategoria: false,
    subcategorias: [],
    ...extra,
  }
}

const RESUMO_8K = {
  renda: '10000.00',
  gastos_planejados: '8000.00',
  balanco_planejado: '2000.00',
  economia_planejada: '20.00',
}

function orcamento(extra: Partial<OrcamentoSaida> = {}): OrcamentoSaida {
  return {
    id: 1,
    mes: '2026-10',
    renda: '10000.00',
    percentual_economia: '20.00',
    orcamento_gastos: '8000.00',
    economia: '2000.00',
    categorias: [cat(10, 'Moradia', '3000.00'), cat(20, 'Mercado', '2000.00')],
    total_categorizado: '5000.00',
    falta_distribuir: '3000.00',
    excedente: '0.00',
    resumo: RESUMO_8K,
    ...extra,
  }
}

function mesDe(o: OrcamentoSaida | null, sugerida = '10000.00') {
  return json({ mes: '2026-10', orcamento: o, renda_sugerida: sugerida })
}

function linhaCmp(nome: string, extra: Partial<ComparacaoLinhaCategoria> = {}): ComparacaoLinhaCategoria {
  return {
    categoria_id: 1,
    nome,
    icone: null,
    cor: null,
    arquivada: false,
    limite: '1000.00',
    gasto: '0.00',
    restante: '1000.00',
    consumo: '0.00',
    acima_do_limite: false,
    subcategorias: [],
    ...extra,
  }
}

function comparacao(linhas: ComparacaoLinhaCategoria[], total: Partial<ComparacaoSaida['total']> = {}): ComparacaoSaida {
  return {
    mes: '2026-10',
    linhas,
    total: {
      planejado: '5000.00',
      gasto: '2450.00',
      restante: '2550.00',
      consumo: '49.00',
      acima_do_limite: false,
      ...total,
    },
  }
}

const ROTAS_BASE = {
  'GET /api/categorias': json(CATEGORIAS),
  'GET /api/orcamentos/2026-10/comparacao': json(comparacao([])),
}

// Prévia calculada no teste (centavos inteiros) para o assistente reagir como o servidor.
function centavos(texto: string): number {
  return Math.round(parseFloat(texto) * 100)
}
function reais(c: number): string {
  return (c / 100).toFixed(2)
}
function previaDe(corpo: OrcamentoEntrada): OrcamentoSaida {
  const renda = centavos(corpo.renda)
  const economia = Math.round((renda * centavos(corpo.percentual_economia)) / 10000)
  const gastos = renda - economia
  const categorias = corpo.categorias.map((c) => {
    const subs = c.subcategorias ?? []
    const limite = subs.length > 0 ? subs.reduce((s, x) => s + centavos(x.limite), 0) : centavos(c.limite ?? '0')
    const nome = CATEGORIAS.find((x) => x.id === c.categoria_id)?.nome ?? '?'
    return cat(c.categoria_id, nome, reais(limite), { por_subcategoria: subs.length > 0 })
  })
  const total = categorias.reduce((s, c) => s + centavos(c.limite), 0)
  return orcamento({
    renda: corpo.renda,
    percentual_economia: corpo.percentual_economia,
    orcamento_gastos: reais(gastos),
    economia: reais(economia),
    categorias,
    total_categorizado: reais(total),
    falta_distribuir: reais(Math.max(gastos - total, 0)),
    excedente: reais(Math.max(total - gastos, 0)),
  })
}
const PREVIA = ({ corpo }: Chamada): Resposta => json(previaDe(corpo as OrcamentoEntrada))

function cartao(rotulo: string) {
  return screen.getByText(rotulo).closest('div')!
}

// Espera o cartão de resumo carregar e confere o valor mostrado nele.
async function esperarCartao(rotulo: string, valor: string) {
  await waitFor(() => expect(within(cartao(rotulo)).getByText(valor)).toBeInTheDocument())
}

type Usuario = ReturnType<typeof renderizarApp>['user']

async function abrirAssistenteVazio(user: Usuario) {
  await user.click(await screen.findByRole('button', { name: 'Definir novo orçamento' }))
  return screen.findByRole('dialog', { name: 'Assistente do orçamento' })
}

async function marcar(user: Usuario, dialogo: HTMLElement, ...nomes: string[]) {
  await user.click(within(dialogo).getByRole('button', { name: 'Gerenciar categorias' }))
  for (const nome of nomes) await user.click(await within(dialogo).findByRole('checkbox', { name: nome }))
  await user.click(within(dialogo).getByRole('button', { name: 'Gerenciar categorias' }))
}

async function irParaPasso2(user: Usuario, dialogo: HTMLElement) {
  await user.click(within(dialogo).getByRole('button', { name: 'Avançar' }))
  await within(dialogo).findByRole('heading', { name: 'Limites por categoria' })
}

function ultimoCorpo(api: { chamadasDe(c: string): Chamada[] }, chave: string) {
  return api.chamadasDe(chave).at(-1)!.corpo as OrcamentoEntrada
}

// ---------- CA-7.02, CA-7.03: mês e estado vazio ----------

describe('Orcamento: seletor de mês e estado vazio (CA-7.02, CA-7.03)', () => {
  it('abre no mês corrente da sessão e o seletor próprio troca o orçamento exibido', async () => {
    const api = simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-09': json({
        mes: '2026-09',
        orcamento: orcamento({ mes: '2026-09', renda: '8000.00', resumo: { ...RESUMO_8K, renda: '8000.00' } }),
        renda_sugerida: '8000.00',
      }),
      'GET /api/orcamentos/2026-09/comparacao': json(comparacao([])),
      'GET /api/orcamentos/2026-10': mesDe(orcamento()),
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    expect(await screen.findByText('outubro de 2026')).toBeInTheDocument()
    await esperarCartao('Renda', '+R$ 10.000,00')
    await user.click(screen.getByRole('button', { name: 'mês anterior' }))
    expect(await screen.findByText('setembro de 2026')).toBeInTheDocument()
    await esperarCartao('Renda', '+R$ 8.000,00')
    expect(api.chamadasDe('GET /api/orcamentos/2026-09').length).toBeGreaterThan(0)
  })

  it('mês sem orçamento mostra o estado vazio com "Definir novo orçamento" e "Copiar do mês anterior"', async () => {
    simularApi({ ...ROTAS_BASE, 'GET /api/orcamentos/2026-10': mesDe(null) })
    renderizarApp('/planejamento/orcamento')
    expect(await screen.findByText('Este mês ainda não tem orçamento.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Definir novo orçamento' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copiar do mês anterior' })).toBeInTheDocument()
  })

  it('erro ao carregar o orçamento mostra a mensagem do servidor', async () => {
    simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': erroApi(403, 'SEM_VINCULO', 'Você não tem um casal vinculado.'),
    })
    renderizarApp('/planejamento/orcamento')
    expect(await screen.findByText('Você não tem um casal vinculado.')).toBeInTheDocument()
  })

  it('resposta velha de outro mês não sobrescreve a do mês atual (troca rápida)', async () => {
    let liberarOutubro: () => void = () => {}
    const outubroPronto = new Promise<void>((r) => (liberarOutubro = r))
    simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': async () => {
        await outubroPronto
        return mesDe(orcamento({ renda: '10000.00' }))
      },
      'GET /api/orcamentos/2026-09': json({
        mes: '2026-09',
        orcamento: orcamento({ mes: '2026-09', renda: '8000.00', resumo: { ...RESUMO_8K, renda: '8000.00' } }),
        renda_sugerida: '8000.00',
      }),
      'GET /api/orcamentos/2026-09/comparacao': json(comparacao([])),
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    await user.click(await screen.findByRole('button', { name: 'mês anterior' }))
    await esperarCartao('Renda', '+R$ 8.000,00')
    liberarOutubro()
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByText('setembro de 2026')).toBeInTheDocument()
    expect(within(cartao('Renda')).getByText('+R$ 8.000,00')).toBeInTheDocument()
    expect(screen.queryByText('+R$ 10.000,00')).toBeNull()
  })
})

// ---------- CA-7.06, CA-7.07: resumo, excluir ----------

describe('Orcamento: resumo, edição e exclusão (CA-7.06, CA-7.07)', () => {
  it('mostra renda, gastos planejados e balanço planejado', async () => {
    simularApi({ ...ROTAS_BASE, 'GET /api/orcamentos/2026-10': mesDe(orcamento()) })
    renderizarApp('/planejamento/orcamento')
    await esperarCartao('Renda', '+R$ 10.000,00')
    await esperarCartao('Gastos planejados', '-R$ 8.000,00')
    await esperarCartao('Balanço planejado', 'R$ 2.000,00')
  })

  it('a economia planejada é mostrada como porcentagem ("20.00" -> "20,00%"), não como valor em reais', async () => {
    simularApi({ ...ROTAS_BASE, 'GET /api/orcamentos/2026-10': mesDe(orcamento()) })
    renderizarApp('/planejamento/orcamento')
    await screen.findByText('Economia planejada')
    await esperarCartao('Economia planejada', '20,00%')
  })

  it('sem renda, a economia planejada não é calculada', async () => {
    simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': mesDe(
        orcamento({ renda: '0.00', resumo: { ...RESUMO_8K, renda: '0.00', economia_planejada: null } }),
      ),
    })
    renderizarApp('/planejamento/orcamento')
    await screen.findByText('Economia planejada')
    await esperarCartao('Economia planejada', '—')
  })

  it('excluir só apaga após confirmação e volta o mês ao estado vazio', async () => {
    let existe = true
    const api = simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': () => mesDe(existe ? orcamento() : null),
      'DELETE /api/orcamentos/2026-10': () => {
        existe = false
        return { status: 204 }
      },
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir orçamento' })
    expect(api.chamadasDe('DELETE /api/orcamentos/2026-10')).toHaveLength(0)
    await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }))
    expect(await screen.findByText('Este mês ainda não tem orçamento.')).toBeInTheDocument()
    expect(api.chamadasDe('DELETE /api/orcamentos/2026-10')).toHaveLength(1)
    expect(api.chamadas.filter((c) => c.caminho.startsWith('/api/lancamentos'))).toHaveLength(0)
  })

  it('cancelar a exclusão mantém o orçamento', async () => {
    const api = simularApi({ ...ROTAS_BASE, 'GET /api/orcamentos/2026-10': mesDe(orcamento()) })
    const { user } = renderizarApp('/planejamento/orcamento')
    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Excluir orçamento' })).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.chamadasDe('DELETE /api/orcamentos/2026-10')).toHaveLength(0)
  })

  it('erro na exclusão fecha a confirmação e mostra a mensagem; trocar de mês a apaga', async () => {
    simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': mesDe(orcamento()),
      'GET /api/orcamentos/2026-09': json({ mes: '2026-09', orcamento: null, renda_sugerida: '0.00' }),
      'DELETE /api/orcamentos/2026-10': erroApi(403, 'CASAL_ENCERRADO', 'O casal foi encerrado.'),
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Excluir orçamento' })).getByRole('button', { name: 'Excluir' }))
    expect(await screen.findByText('O casal foi encerrado.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'mês anterior' }))
    await screen.findByText('setembro de 2026')
    expect(screen.queryByText('O casal foi encerrado.')).toBeNull()
  })
})

// ---------- CA-7.08: copiar do mês anterior ----------

describe('Orcamento: copiar do mês anterior (CA-7.08)', () => {
  it('mês vazio: copia sem substituir e passa a mostrar o orçamento criado', async () => {
    let existe = false
    const api = simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': () => mesDe(existe ? orcamento() : null),
      'POST /api/orcamentos/2026-10/copiar-do-anterior': () => {
        existe = true
        return json(orcamento(), 201)
      },
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    await user.click(await screen.findByRole('button', { name: 'Copiar do mês anterior' }))
    await esperarCartao('Renda', '+R$ 10.000,00')
    expect(api.chamadasDe('POST /api/orcamentos/2026-10/copiar-do-anterior')[0]!.corpo).toEqual({ substituir: false })
  })

  it('mês anterior sem orçamento: informa e não cria nada', async () => {
    const api = simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': mesDe(null),
      'POST /api/orcamentos/2026-10/copiar-do-anterior': erroApi(404, 'ORCAMENTO_ANTERIOR_NAO_ENCONTRADO', 'O mês anterior não tem orçamento.'),
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    await user.click(await screen.findByRole('button', { name: 'Copiar do mês anterior' }))
    expect(await screen.findByText('O mês anterior não tem orçamento.')).toBeInTheDocument()
    expect(screen.getByText('Este mês ainda não tem orçamento.')).toBeInTheDocument()
    expect(api.chamadas.filter((c) => c.metodo === 'POST' && c.caminho === '/api/orcamentos/2026-10')).toHaveLength(0)
  })

  it('o erro de cópia some ao trocar de mês', async () => {
    simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': mesDe(null),
      'GET /api/orcamentos/2026-09': json({ mes: '2026-09', orcamento: null, renda_sugerida: '0.00' }),
      'POST /api/orcamentos/2026-10/copiar-do-anterior': erroApi(404, 'ORCAMENTO_ANTERIOR_NAO_ENCONTRADO', 'O mês anterior não tem orçamento.'),
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    await user.click(await screen.findByRole('button', { name: 'Copiar do mês anterior' }))
    await screen.findByText('O mês anterior não tem orçamento.')
    await user.click(screen.getByRole('button', { name: 'mês anterior' }))
    await screen.findByText('setembro de 2026')
    expect(screen.queryByText('O mês anterior não tem orçamento.')).toBeNull()
  })

  it('"Copiar do mês anterior" aparece também com orçamento no mês (RF-7.08)', async () => {
    simularApi({ ...ROTAS_BASE, 'GET /api/orcamentos/2026-10': mesDe(orcamento()) })
    renderizarApp('/planejamento/orcamento')
    expect(await screen.findByRole('button', { name: 'Copiar do mês anterior' })).toBeInTheDocument()
  })

  it('com orçamento no mês: servidor recusa (409), a tela pede confirmação e só substitui depois dela', async () => {
    const api = simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': mesDe(orcamento()),
      'POST /api/orcamentos/2026-10/copiar-do-anterior': ({ corpo }) =>
        (corpo as { substituir: boolean }).substituir
          ? json(orcamento(), 200)
          : erroApi(409, 'ORCAMENTO_JA_EXISTE', 'Este mês já tem orçamento.'),
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    await user.click(await screen.findByRole('button', { name: 'Copiar do mês anterior' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Substituir orçamento' })
    expect(screen.queryByText('Este mês já tem orçamento.')).toBeNull()
    expect(api.chamadasDe('POST /api/orcamentos/2026-10/copiar-do-anterior')).toHaveLength(1)
    await user.click(within(dialogo).getByRole('button', { name: 'Substituir' }))
    await waitFor(() => expect(api.chamadasDe('POST /api/orcamentos/2026-10/copiar-do-anterior')).toHaveLength(2))
    expect(api.chamadasDe('POST /api/orcamentos/2026-10/copiar-do-anterior')[1]!.corpo).toEqual({ substituir: true })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('cancelar a confirmação de substituição não faz nova chamada', async () => {
    const api = simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': mesDe(orcamento()),
      'POST /api/orcamentos/2026-10/copiar-do-anterior': erroApi(409, 'ORCAMENTO_JA_EXISTE', 'Este mês já tem orçamento.'),
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    await user.click(await screen.findByRole('button', { name: 'Copiar do mês anterior' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Substituir orçamento' })
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.chamadasDe('POST /api/orcamentos/2026-10/copiar-do-anterior')).toHaveLength(1)
  })

  it('mês aparentemente vazio que já tem orçamento no servidor (409): reconsulta e pede confirmação', async () => {
    let existe = false
    const api = simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': () => mesDe(existe ? orcamento() : null),
      'POST /api/orcamentos/2026-10/copiar-do-anterior': () => {
        existe = true
        return erroApi(409, 'ORCAMENTO_JA_EXISTE', 'Este mês já tem orçamento.')
      },
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    await user.click(await screen.findByRole('button', { name: 'Copiar do mês anterior' }))
    await screen.findByRole('dialog', { name: 'Substituir orçamento' })
    await esperarCartao('Renda', '+R$ 10.000,00')
    expect(api.chamadasDe('GET /api/orcamentos/2026-10').length).toBeGreaterThan(1)
  })
})

// ---------- CA-7.04: assistente, passo 1 ----------

describe('AssistenteOrcamento: passo 1, renda e percentual (CA-7.04)', () => {
  it('a renda vem preenchida com a sugerida pelos salários (R$ 10.000,00) e a prévia mostra gastos R$ 8.000,00 e economia R$ 2.000,00', async () => {
    simularApi({ ...ROTAS_BASE, 'GET /api/orcamentos/2026-10': mesDe(null, '10000.00'), 'POST /api/previa-orcamento': PREVIA })
    const { user } = renderizarApp('/planejamento/orcamento')
    const dialogo = await abrirAssistenteVazio(user)
    expect(within(dialogo).getByLabelText('Renda do mês')).toHaveValue('10.000,00')
    expect(within(dialogo).getByLabelText('Percentual para economizar')).toHaveValue('20,00')
    expect(await within(dialogo).findByText('Orçamento de gastos: R$ 8.000,00')).toBeInTheDocument()
    expect(within(dialogo).getByText('Economia: R$ 2.000,00')).toBeInTheDocument()
  })

  it('com A confirmado em R$ 6.500,00 a renda sugerida vem R$ 10.500,00', async () => {
    simularApi({ ...ROTAS_BASE, 'GET /api/orcamentos/2026-10': mesDe(null, '10500.00'), 'POST /api/previa-orcamento': PREVIA })
    const { user } = renderizarApp('/planejamento/orcamento')
    const dialogo = await abrirAssistenteVazio(user)
    expect(within(dialogo).getByLabelText('Renda do mês')).toHaveValue('10.500,00')
  })

  it('alterar a renda para R$ 9.000,00 é aceito e atualiza a prévia', async () => {
    simularApi({ ...ROTAS_BASE, 'GET /api/orcamentos/2026-10': mesDe(null), 'POST /api/previa-orcamento': PREVIA })
    const { user } = renderizarApp('/planejamento/orcamento')
    const dialogo = await abrirAssistenteVazio(user)
    const renda = within(dialogo).getByLabelText('Renda do mês')
    await user.clear(renda)
    await user.type(renda, '900000')
    expect(renda).toHaveValue('9.000,00')
    expect(await within(dialogo).findByText('Orçamento de gastos: R$ 7.200,00')).toBeInTheDocument()
    expect(within(dialogo).getByText('Economia: R$ 1.800,00')).toBeInTheDocument()
  })

  it('percentual 101 é recusado ao avançar, com foco no campo, sem chamar o servidor para salvar', async () => {
    const api = simularApi({ ...ROTAS_BASE, 'GET /api/orcamentos/2026-10': mesDe(null), 'POST /api/previa-orcamento': PREVIA })
    const { user } = renderizarApp('/planejamento/orcamento')
    const dialogo = await abrirAssistenteVazio(user)
    const pct = within(dialogo).getByLabelText('Percentual para economizar')
    await user.clear(pct)
    await user.type(pct, '101')
    expect(await within(dialogo).findByText('Informe um percentual de 0 a 100 para ver os valores.')).toBeInTheDocument()
    await user.click(within(dialogo).getByRole('button', { name: 'Avançar' }))
    expect((await within(dialogo).findAllByText('Informe um percentual de 0 a 100.')).length).toBeGreaterThan(0)
    expect(pct).toHaveAttribute('aria-invalid', 'true')
    expect(pct).toHaveFocus()
    expect(within(dialogo).queryByRole('heading', { name: 'Limites por categoria' })).toBeNull()
    expect(api.chamadasDe('POST /api/orcamentos/2026-10')).toHaveLength(0)
  })

  it('percentual 100 e 0 são aceitos', async () => {
    simularApi({ ...ROTAS_BASE, 'GET /api/orcamentos/2026-10': mesDe(null), 'POST /api/previa-orcamento': PREVIA })
    const { user } = renderizarApp('/planejamento/orcamento')
    const dialogo = await abrirAssistenteVazio(user)
    const pct = within(dialogo).getByLabelText('Percentual para economizar')
    await user.clear(pct)
    await user.type(pct, '100')
    expect(await within(dialogo).findByText('Orçamento de gastos: R$ 0,00')).toBeInTheDocument()
    await user.clear(pct)
    await user.type(pct, '0')
    expect(await within(dialogo).findByText('Economia: R$ 0,00')).toBeInTheDocument()
    await irParaPasso2(user, dialogo)
  })

  it('o assistente de edição abre com os valores do orçamento existente', async () => {
    simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': mesDe(orcamento({ renda: '9000.00', percentual_economia: '15.50' })),
      'POST /api/previa-orcamento': PREVIA,
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Assistente do orçamento' })
    expect(within(dialogo).getByLabelText('Renda do mês')).toHaveValue('9.000,00')
    expect(within(dialogo).getByLabelText('Percentual para economizar')).toHaveValue('15,50')
  })
})

// ---------- CA-7.05: passo 2 ----------

describe('LimitesCategorias: passo 2 (CA-7.05)', () => {
  it('Moradia 3.000 e Mercado 2.000: total categorizado R$ 5.000,00, falta distribuir R$ 3.000,00, sem excedente', async () => {
    simularApi({ ...ROTAS_BASE, 'GET /api/orcamentos/2026-10': mesDe(null), 'POST /api/previa-orcamento': PREVIA })
    const { user } = renderizarApp('/planejamento/orcamento')
    const dialogo = await abrirAssistenteVazio(user)
    await irParaPasso2(user, dialogo)
    await marcar(user, dialogo, 'Moradia', 'Mercado')
    await user.type(within(dialogo).getByLabelText('Limite de Moradia'), '300000')
    await user.type(within(dialogo).getByLabelText('Limite de Mercado'), '200000')
    expect(await within(dialogo).findByText('Total categorizado: R$ 5.000,00')).toBeInTheDocument()
    expect(within(dialogo).getByText('Falta distribuir: R$ 3.000,00')).toBeInTheDocument()
    expect(within(dialogo).getByText('Excedente: R$ 0,00')).toBeInTheDocument()
  })

  it('aumentar Mercado para R$ 6.000,00 mostra excedente de R$ 1.000,00 em destaque e o orçamento ainda pode ser salvo', async () => {
    const api = simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': mesDe(null),
      'POST /api/previa-orcamento': PREVIA,
      'POST /api/orcamentos/2026-10': ({ corpo }) => json(previaDe(corpo as OrcamentoEntrada), 201),
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    const dialogo = await abrirAssistenteVazio(user)
    await irParaPasso2(user, dialogo)
    await marcar(user, dialogo, 'Moradia', 'Mercado')
    await user.type(within(dialogo).getByLabelText('Limite de Moradia'), '300000')
    await user.type(within(dialogo).getByLabelText('Limite de Mercado'), '600000')
    const excedente = await within(dialogo).findByText('Excedente: R$ 1.000,00')
    // Destaque diferente do estado normal (classe própria) e com texto, não só cor.
    const normal = within(dialogo).getByText('Total categorizado: R$ 9.000,00')
    expect(excedente.className).not.toBe(normal.className)
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Assistente do orçamento' })).toBeNull())
    expect(api.chamadasDe('POST /api/orcamentos/2026-10')).toHaveLength(1)
  })

  it('limites por subcategoria (400 e 600) mostram o total da categoria R$ 1.000,00 sem campo direto', async () => {
    simularApi({ ...ROTAS_BASE, 'GET /api/orcamentos/2026-10': mesDe(null), 'POST /api/previa-orcamento': PREVIA })
    const { user } = renderizarApp('/planejamento/orcamento')
    const dialogo = await abrirAssistenteVazio(user)
    await irParaPasso2(user, dialogo)
    await marcar(user, dialogo, 'Moradia')
    await user.type(within(dialogo).getByLabelText('Limite de Aluguel'), '40000')
    await user.type(within(dialogo).getByLabelText('Limite de Condomínio'), '60000')
    expect(await within(dialogo).findByText('Total das subcategorias: R$ 1.000,00')).toBeInTheDocument()
    expect(within(dialogo).queryByLabelText('Limite de Moradia')).toBeNull()
  })

  it('o corpo enviado traz subcategorias (sem limite na categoria) quando há limite por subcategoria', async () => {
    const api = simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': mesDe(null),
      'POST /api/previa-orcamento': PREVIA,
      'POST /api/orcamentos/2026-10': ({ corpo }) => json(previaDe(corpo as OrcamentoEntrada), 201),
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    const dialogo = await abrirAssistenteVazio(user)
    await irParaPasso2(user, dialogo)
    await marcar(user, dialogo, 'Moradia')
    await user.type(within(dialogo).getByLabelText('Limite de Aluguel'), '40000')
    await user.type(within(dialogo).getByLabelText('Limite de Condomínio'), '60000')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.chamadasDe('POST /api/orcamentos/2026-10')).toHaveLength(1))
    expect(ultimoCorpo(api, 'POST /api/orcamentos/2026-10')).toEqual({
      renda: '10000.00',
      percentual_economia: '20.00',
      categorias: [
        {
          categoria_id: 10,
          subcategorias: [
            { categoria_id: 11, limite: '400.00' },
            { categoria_id: 12, limite: '600.00' },
          ],
        },
      ],
    })
  })

  it('"Gerenciar categorias": a categoria desmarcada fica fora do orçamento (corpo e tela)', async () => {
    const api = simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': mesDe(null),
      'POST /api/previa-orcamento': PREVIA,
      'POST /api/orcamentos/2026-10': ({ corpo }) => json(previaDe(corpo as OrcamentoEntrada), 201),
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    const dialogo = await abrirAssistenteVazio(user)
    await irParaPasso2(user, dialogo)
    await marcar(user, dialogo, 'Moradia', 'Mercado')
    await user.type(within(dialogo).getByLabelText('Limite de Mercado'), '200000')
    await user.click(within(dialogo).getByRole('button', { name: 'Gerenciar categorias' }))
    await user.click(within(dialogo).getByRole('checkbox', { name: 'Moradia' }))
    expect(within(dialogo).queryByLabelText('Limite de Aluguel')).toBeNull()
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.chamadasDe('POST /api/orcamentos/2026-10')).toHaveLength(1))
    expect(ultimoCorpo(api, 'POST /api/orcamentos/2026-10').categorias).toEqual([{ categoria_id: 20, limite: '2000.00' }])
  })

  it('limite negativo é recusado pelo servidor e a mensagem aparece com o nome da categoria', async () => {
    simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': mesDe(null),
      'POST /api/previa-orcamento': PREVIA,
      'POST /api/orcamentos/2026-10': erroApi(422, 'VALIDACAO', 'Dados inválidos.', {
        'categorias.0.limite': 'O limite não pode ser negativo.',
      }),
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    const dialogo = await abrirAssistenteVazio(user)
    await irParaPasso2(user, dialogo)
    await marcar(user, dialogo, 'Mercado')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText(/O limite não pode ser negativo\./)).toBeInTheDocument()
    expect(within(dialogo).getByLabelText('Limite de Mercado')).toBeInTheDocument()
  })

  it('o campo de limite só aceita dígitos (não há como digitar sinal negativo)', async () => {
    simularApi({ ...ROTAS_BASE, 'GET /api/orcamentos/2026-10': mesDe(null), 'POST /api/previa-orcamento': PREVIA })
    const { user } = renderizarApp('/planejamento/orcamento')
    const dialogo = await abrirAssistenteVazio(user)
    await irParaPasso2(user, dialogo)
    await marcar(user, dialogo, 'Mercado')
    const campo = within(dialogo).getByLabelText('Limite de Mercado')
    await user.type(campo, '-500')
    expect(campo).toHaveValue('5,00')
  })

  it('categoria arquivada que já está no orçamento continua listada com a indicação "arquivada"', async () => {
    simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': mesDe(
        orcamento({ categorias: [cat(20, 'Mercado', '2000.00'), cat(30, 'Lazer', '500.00', { arquivada: true })] }),
      ),
      'POST /api/previa-orcamento': PREVIA,
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Assistente do orçamento' })
    await irParaPasso2(user, dialogo)
    expect(await within(dialogo).findByText('(arquivada)')).toBeInTheDocument()
    expect(within(dialogo).getByLabelText('Limite de Lazer')).toHaveValue('500,00')
  })

  it('editar um limite salva por PUT e a tela passa a mostrar o novo resumo', async () => {
    let atual = orcamento()
    const api = simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': () => mesDe(atual),
      'POST /api/previa-orcamento': PREVIA,
      'PUT /api/orcamentos/2026-10': ({ corpo }) => {
        atual = previaDe(corpo as OrcamentoEntrada)
        return json(atual)
      },
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Assistente do orçamento' })
    await irParaPasso2(user, dialogo)
    const mercado = within(dialogo).getByLabelText('Limite de Mercado')
    expect(mercado).toHaveValue('2.000,00')
    await user.clear(mercado)
    await user.type(mercado, '250000')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.chamadasDe('PUT /api/orcamentos/2026-10')).toHaveLength(1))
    expect(ultimoCorpo(api, 'PUT /api/orcamentos/2026-10').categorias).toEqual([
      { categoria_id: 10, limite: '3000.00' },
      { categoria_id: 20, limite: '2500.00' },
    ])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findByText('Total')).toBeInTheDocument()
    expect(api.chamadasDe('POST /api/orcamentos/2026-10')).toHaveLength(0)
  })

  it('Voltar do passo 2 preserva os limites digitados', async () => {
    simularApi({ ...ROTAS_BASE, 'GET /api/orcamentos/2026-10': mesDe(null), 'POST /api/previa-orcamento': PREVIA })
    const { user } = renderizarApp('/planejamento/orcamento')
    const dialogo = await abrirAssistenteVazio(user)
    await irParaPasso2(user, dialogo)
    await marcar(user, dialogo, 'Mercado')
    await user.type(within(dialogo).getByLabelText('Limite de Mercado'), '123456')
    await user.click(within(dialogo).getByRole('button', { name: 'Voltar' }))
    expect(await within(dialogo).findByLabelText('Renda do mês')).toBeInTheDocument()
    await user.click(within(dialogo).getByRole('button', { name: 'Avançar' }))
    expect(await within(dialogo).findByLabelText('Limite de Mercado')).toHaveValue('1.234,56')
  })
})

// ---------- Roteiro t231: zero × vazio, limite zero ----------

describe('LimitesCategorias: zero digitado × vazio (D-055 a D-057)', () => {
  async function abrirMoradia(user: Usuario) {
    const dialogo = await abrirAssistenteVazio(user)
    await irParaPasso2(user, dialogo)
    await marcar(user, dialogo, 'Moradia')
    return dialogo
  }

  function rotasAssistente() {
    return simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': mesDe(null),
      'POST /api/previa-orcamento': PREVIA,
      'POST /api/orcamentos/2026-10': ({ corpo }) => json(previaDe(corpo as OrcamentoEntrada), 201),
    })
  }

  it('zero digitado em subcategoria fica "0,00" e vai no corpo com limite "0.00"; a vazia não vai', async () => {
    const api = rotasAssistente()
    const { user } = renderizarApp('/planejamento/orcamento')
    const dialogo = await abrirMoradia(user)
    const aluguel = within(dialogo).getByLabelText('Limite de Aluguel')
    await user.type(aluguel, '0')
    expect(aluguel).toHaveValue('0,00')
    expect(within(dialogo).getByLabelText('Limite de Condomínio')).toHaveValue('')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.chamadasDe('POST /api/orcamentos/2026-10')).toHaveLength(1))
    expect(ultimoCorpo(api, 'POST /api/orcamentos/2026-10').categorias).toEqual([
      { categoria_id: 10, subcategorias: [{ categoria_id: 11, limite: '0.00' }] },
    ])
  })

  it('apagar a partir de "0,00" esvazia o campo e a categoria volta a ter limite próprio', async () => {
    const api = rotasAssistente()
    const { user } = renderizarApp('/planejamento/orcamento')
    const dialogo = await abrirMoradia(user)
    const aluguel = within(dialogo).getByLabelText('Limite de Aluguel')
    await user.type(aluguel, '0')
    expect(within(dialogo).queryByLabelText('Limite de Moradia')).toBeNull()
    await user.type(aluguel, '{Backspace}')
    expect(aluguel).toHaveValue('')
    expect(await within(dialogo).findByLabelText('Limite de Moradia')).toHaveValue('')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.chamadasDe('POST /api/orcamentos/2026-10')).toHaveLength(1))
    expect(ultimoCorpo(api, 'POST /api/orcamentos/2026-10').categorias).toEqual([{ categoria_id: 10, limite: '0.00' }])
  })

  it('apagar dígito a dígito um valor maior passa por "0,00" e o próximo apagar deixa o campo vazio', async () => {
    rotasAssistente()
    const { user } = renderizarApp('/planejamento/orcamento')
    const dialogo = await abrirMoradia(user)
    const aluguel = within(dialogo).getByLabelText('Limite de Aluguel')
    await user.type(aluguel, '12')
    expect(aluguel).toHaveValue('0,12')
    await user.type(aluguel, '{Backspace}{Backspace}')
    expect(aluguel).toHaveValue('0,00')
    await user.type(aluguel, '{Backspace}')
    expect(aluguel).toHaveValue('')
  })

  it('limite zero na categoria é aceito e enviado como "0.00"', async () => {
    const api = rotasAssistente()
    const { user } = renderizarApp('/planejamento/orcamento')
    const dialogo = await abrirAssistenteVazio(user)
    await irParaPasso2(user, dialogo)
    await marcar(user, dialogo, 'Mercado')
    const campo = within(dialogo).getByLabelText('Limite de Mercado')
    await user.type(campo, '0')
    expect(campo).toHaveValue('0,00')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.chamadasDe('POST /api/orcamentos/2026-10')).toHaveLength(1))
    expect(ultimoCorpo(api, 'POST /api/orcamentos/2026-10').categorias).toEqual([{ categoria_id: 20, limite: '0.00' }])
  })

  it('na edição, subcategoria com limite zero volta como "0,00" e continua indo no corpo', async () => {
    const api = simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': mesDe(
        orcamento({
          categorias: [
            cat(10, 'Moradia', '400.00', {
              por_subcategoria: true,
              subcategorias: [
                { categoria_id: 11, nome: 'Aluguel', arquivada: false, limite: '0.00' },
                { categoria_id: 12, nome: 'Condomínio', arquivada: false, limite: '400.00' },
              ],
            }),
          ],
        }),
      ),
      'POST /api/previa-orcamento': PREVIA,
      'PUT /api/orcamentos/2026-10': ({ corpo }) => json(previaDe(corpo as OrcamentoEntrada)),
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Assistente do orçamento' })
    await irParaPasso2(user, dialogo)
    expect(within(dialogo).getByLabelText('Limite de Aluguel')).toHaveValue('0,00')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.chamadasDe('PUT /api/orcamentos/2026-10')).toHaveLength(1))
    expect(ultimoCorpo(api, 'PUT /api/orcamentos/2026-10').categorias[0]!.subcategorias).toEqual([
      { categoria_id: 11, limite: '0.00' },
      { categoria_id: 12, limite: '400.00' },
    ])
  })
})

// ---------- Roteiro t231: ORCAMENTO_JA_EXISTE, erro velho, prévia velha ----------

describe('AssistenteOrcamento: conflito, erros e prévia (D-055 a D-057)', () => {
  it('ORCAMENTO_JA_EXISTE (409): avisa, reconsulta e o próximo Salvar usa PUT sem nova confirmação', async () => {
    let existe = false
    const api = simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': () => mesDe(existe ? orcamento() : null),
      'POST /api/previa-orcamento': PREVIA,
      'POST /api/orcamentos/2026-10': () => {
        existe = true
        return erroApi(409, 'ORCAMENTO_JA_EXISTE', 'Já existe orçamento neste mês.')
      },
      'PUT /api/orcamentos/2026-10': ({ corpo }) => json(previaDe(corpo as OrcamentoEntrada)),
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    const dialogo = await abrirAssistenteVazio(user)
    await irParaPasso2(user, dialogo)
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText(/Este mês já tem orçamento\. Feche o assistente/)).toBeInTheDocument()
    await waitFor(() => expect(api.chamadasDe('GET /api/orcamentos/2026-10').length).toBeGreaterThan(1))
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.chamadasDe('PUT /api/orcamentos/2026-10')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/orcamentos/2026-10')).toHaveLength(1)
    expect(screen.queryByRole('dialog', { name: 'Substituir orçamento' })).toBeNull()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('o aviso de erro de salvar some ao tentar de novo (erro velho não persiste)', async () => {
    let tentativas = 0
    const api = simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': mesDe(null),
      'POST /api/previa-orcamento': PREVIA,
      'POST /api/orcamentos/2026-10': ({ corpo }) => {
        tentativas += 1
        return tentativas === 1
          ? erroApi(403, 'CASAL_ENCERRADO', 'O casal foi encerrado.')
          : json(previaDe(corpo as OrcamentoEntrada), 201)
      },
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    const dialogo = await abrirAssistenteVazio(user)
    await irParaPasso2(user, dialogo)
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText('O casal foi encerrado.')).toBeInTheDocument()
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.chamadasDe('POST /api/orcamentos/2026-10')).toHaveLength(2))
    await waitFor(() => expect(screen.queryByText('O casal foi encerrado.')).toBeNull())
  })

  it('erro de campo no passo 1 reabre o passo 1 com a mensagem junto ao campo', async () => {
    simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': mesDe(null),
      'POST /api/previa-orcamento': PREVIA,
      'POST /api/orcamentos/2026-10': erroApi(422, 'VALIDACAO', 'Dados inválidos.', { renda: 'A renda não pode ser negativa.' }),
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    const dialogo = await abrirAssistenteVazio(user)
    await irParaPasso2(user, dialogo)
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect((await within(dialogo).findAllByText('A renda não pode ser negativa.')).length).toBeGreaterThan(0)
    expect(within(dialogo).getByLabelText('Renda do mês')).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialogo).getByLabelText('Renda do mês')).toHaveFocus()
  })

  it('o erro de cópia some ao reabrir o assistente', async () => {
    simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': mesDe(null),
      'POST /api/previa-orcamento': PREVIA,
      'POST /api/orcamentos/2026-10/copiar-do-anterior': erroApi(404, 'ORCAMENTO_ANTERIOR_NAO_ENCONTRADO', 'O mês anterior não tem orçamento.'),
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    await user.click(await screen.findByRole('button', { name: 'Copiar do mês anterior' }))
    await screen.findByText('O mês anterior não tem orçamento.')
    await abrirAssistenteVazio(user)
    expect(screen.queryByText('O mês anterior não tem orçamento.')).toBeNull()
  })

  it('resposta velha da prévia não sobrescreve a nova (digitação rápida)', async () => {
    let liberarVelha: () => void = () => {}
    const velhaPronta = new Promise<void>((r) => (liberarVelha = r))
    simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': mesDe(null),
      'POST /api/previa-orcamento': async ({ corpo }) => {
        const c = corpo as OrcamentoEntrada
        if (c.percentual_economia === '20.00') await velhaPronta
        return json(previaDe(c))
      },
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    const dialogo = await abrirAssistenteVazio(user)
    const pct = within(dialogo).getByLabelText('Percentual para economizar')
    // Espera a prévia de 20% ser pedida (fica pendente) e muda para 50%.
    await new Promise((r) => setTimeout(r, 500))
    await user.clear(pct)
    await user.type(pct, '50')
    expect(await within(dialogo).findByText('Economia: R$ 5.000,00')).toBeInTheDocument()
    liberarVelha()
    await new Promise((r) => setTimeout(r, 50))
    expect(within(dialogo).getByText('Economia: R$ 5.000,00')).toBeInTheDocument()
    expect(within(dialogo).queryByText('Economia: R$ 2.000,00')).toBeNull()
  })

  it('erro da prévia aparece no assistente', async () => {
    simularApi({
      ...ROTAS_BASE,
      'GET /api/orcamentos/2026-10': mesDe(null),
      'POST /api/previa-orcamento': erroApi(422, 'VALIDACAO', 'Prévia inválida.'),
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    const dialogo = await abrirAssistenteVazio(user)
    expect(await within(dialogo).findByText('Prévia inválida.')).toBeInTheDocument()
  })
})

// ---------- CA-7.09, CA-7.10: comparação ----------

describe('ComparacaoOrcamento (CA-7.09, CA-7.10)', () => {
  function renderComparacao(cmp: ComparacaoSaida) {
    simularApi({
      'GET /api/categorias': json(CATEGORIAS),
      'GET /api/orcamentos/2026-10': mesDe(orcamento()),
      'GET /api/orcamentos/2026-10/comparacao': json(cmp),
    })
    return renderizarApp('/planejamento/orcamento')
  }

  function itemDe(nome: string) {
    return screen.getByText(nome).closest('li')!
  }

  it('Mercado com limite R$ 2.000,00 e gasto R$ 2.300,00: restante -R$ 300,00, consumo 115,00% e "acima do limite"', async () => {
    renderComparacao(
      comparacao(
        [
          linhaCmp('Mercado', {
            limite: '2000.00',
            gasto: '2300.00',
            restante: '-300.00',
            consumo: '115.00',
            acima_do_limite: true,
          }),
        ],
        { planejado: '2000.00', gasto: '2300.00', restante: '-300.00', consumo: '115.00', acima_do_limite: true },
      ),
    )
    await screen.findByText('Mercado')
    const mercado = itemDe('Mercado')
    expect(within(mercado).getByText('R$ 2.000,00')).toBeInTheDocument()
    expect(within(mercado).getByText('R$ 2.300,00')).toBeInTheDocument()
    expect(within(mercado).getByText('-R$ 300,00')).toBeInTheDocument()
    expect(within(mercado).getByText('115,00%')).toBeInTheDocument()
    expect(within(mercado).getByText('acima do limite')).toBeInTheDocument()
  })

  it('consumo exatamente 100,00% e 80,00% não mostram "acima do limite"', async () => {
    renderComparacao(
      comparacao([
        linhaCmp('Exato', { limite: '1000.00', gasto: '1000.00', restante: '0.00', consumo: '100.00', acima_do_limite: false }),
        linhaCmp('Folga', { limite: '1000.00', gasto: '800.00', restante: '200.00', consumo: '80.00', acima_do_limite: false }),
      ]),
    )
    await screen.findByText('Exato')
    expect(within(itemDe('Exato')).getByText('100,00%')).toBeInTheDocument()
    expect(within(itemDe('Folga')).getByText('80,00%')).toBeInTheDocument()
    expect(screen.queryByText('acima do limite')).toBeNull()
  })

  it('limite R$ 0,00 com gasto R$ 10,00 mostra "acima do limite"', async () => {
    renderComparacao(
      comparacao([
        linhaCmp('Presentes', { limite: '0.00', gasto: '10.00', restante: '-10.00', consumo: null, acima_do_limite: true }),
      ]),
    )
    await screen.findByText('Presentes')
    expect(within(itemDe('Presentes')).getByText('acima do limite')).toBeInTheDocument()
    expect(within(itemDe('Presentes')).getByText('R$ 0,00')).toBeInTheDocument()
  })

  it('categoria com gasto R$ 150,00 e sem limite aparece como "Sem limite"', async () => {
    renderComparacao(
      comparacao([
        linhaCmp('Pets', { limite: null, gasto: '150.00', restante: null, consumo: null, acima_do_limite: false }),
      ]),
    )
    await screen.findByText('Pets')
    const pets = itemDe('Pets')
    expect(within(pets).getByText('Sem limite')).toBeInTheDocument()
    expect(within(pets).getByText('R$ 150,00')).toBeInTheDocument()
  })

  it('a linha de total mostra o planejado e o gasto totais', async () => {
    renderComparacao(comparacao([linhaCmp('Mercado')], { planejado: '5000.00', gasto: '2450.00' }))
    await screen.findByText('Mercado')
    const total = screen.getByText('Total').closest('div')!
    expect(within(total).getByText('R$ 5.000,00')).toBeInTheDocument()
    expect(within(total).getByText('R$ 2.450,00')).toBeInTheDocument()
  })

  it('subcategorias aparecem aninhadas e categoria arquivada leva a indicação "(arquivada)"', async () => {
    renderComparacao(
      comparacao([
        linhaCmp('Moradia', {
          subcategorias: [linhaCmp('Aluguel', { limite: '400.00', gasto: '400.00' })],
        }),
        linhaCmp('Lazer', { arquivada: true }),
      ]),
    )
    await screen.findByText('Moradia')
    expect(within(itemDe('Moradia')).getByText('Aluguel')).toBeInTheDocument()
    expect(within(itemDe('Lazer')).getByText('(arquivada)')).toBeInTheDocument()
  })

  it('comparação com 404 não mostra erro na tela', async () => {
    simularApi({
      'GET /api/categorias': json(CATEGORIAS),
      'GET /api/orcamentos/2026-10': mesDe(orcamento()),
      'GET /api/orcamentos/2026-10/comparacao': erroApi(404, 'NAO_ENCONTRADO', 'Orçamento não encontrado.'),
    })
    renderizarApp('/planejamento/orcamento')
    await screen.findByText('Economia planejada')
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('Orçamento não encontrado.')).toBeNull()
    expect(screen.queryByText('Planejado e gasto')).toBeNull()
  })

  it('resposta velha da comparação de outro mês não sobrescreve a do mês atual', async () => {
    let liberarOutubro: () => void = () => {}
    const pronto = new Promise<void>((r) => (liberarOutubro = r))
    simularApi({
      'GET /api/categorias': json(CATEGORIAS),
      'GET /api/orcamentos/2026-10': mesDe(orcamento()),
      'GET /api/orcamentos/2026-10/comparacao': async () => {
        await pronto
        return json(comparacao([linhaCmp('SóOutubro')]))
      },
      'GET /api/orcamentos/2026-09': json({ mes: '2026-09', orcamento: orcamento({ mes: '2026-09' }), renda_sugerida: '0.00' }),
      'GET /api/orcamentos/2026-09/comparacao': json(comparacao([linhaCmp('SóSetembro')])),
    })
    const { user } = renderizarApp('/planejamento/orcamento')
    await user.click(await screen.findByRole('button', { name: 'mês anterior' }))
    await screen.findByText('SóSetembro')
    liberarOutubro()
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByText('SóSetembro')).toBeInTheDocument()
    expect(screen.queryByText('SóOutubro')).toBeNull()
  })
})
