import { afterEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { QueryClient } from '@tanstack/react-query'
import type { CartaoSaida, FaturaResumo } from '../../api/cartoes'
import type { ContaSaida } from '../../api/contas'
import type { DiaLista, ItemLancamentoLista, ListaControle, Par } from '../../api/controle'
import type { LancamentoSaida } from '../../api/lancamentos'
import type { ProporcaoSaida } from '../../api/proporcao'
import {
  erroApi,
  fixarHoje,
  json,
  limparTudo,
  renderizarApp,
  simularApi,
  simularResizeObserver,
  type Chamada,
  type Handler,
} from '../../testes/utilitarios'
import { vi } from 'vitest'

// O BottomSheet chama history.back() ao desmontar (popstate assíncrono): espera assentar.
afterEach(async () => {
  limparTudo()
  await new Promise((r) => setTimeout(r, 20))
})

const par = (previsto: string, realizado: string): Par => ({ previsto, realizado })
const ZERO = par('0.00', '0.00')

const conta = (id: number, nome: string, dono: number | null): ContaSaida => ({
  id,
  nome,
  instituicao: null,
  tipo: 'conta_corrente',
  cor: '#336699',
  saldo_inicial: '0.00',
  dono_usuario_id: dono,
  arquivado: false,
  casal_encerrado: false,
  saldo_atual: '0.00',
  saldo_previsto: '0.00',
})
const CONTAS = [conta(1, 'Conta Ana', 1), conta(2, 'Conta Conjunta', null)]
const LISTAGEM_CONTAS = { mes: '2026-10', contas: CONTAS, total_saldo_atual: null, total_saldo_previsto: null }

const FATURA: FaturaResumo = {
  cartao_id: 7,
  cartao_nome: 'Nubank',
  conta_id: 2,
  mes: '2026-10',
  id: 30,
  status: 'vencida',
  fechamento: '2026-10-10',
  vencimento: '2026-10-20',
  valor: '800.00',
  pagamento: null,
}
const CARTAO: CartaoSaida = {
  id: 7,
  nome: 'Nubank',
  conta_id: 2,
  dono_usuario_id: null,
  limite: '5000.00',
  dia_fechamento: 10,
  dia_vencimento: 20,
  bandeira: null,
  conta_arquivada: false,
  limite_usado: '800.00',
  limite_disponivel: '4200.00',
  uso_porcentagem: '16.00',
  fatura_corrente: FATURA,
}
const LISTA_CARTOES = { cartoes: [CARTAO], limite_disponivel_total: '4200.00', total_faturas_mes: '800.00' }

const categoria = (id: number, nome: string, subs: { id: number; nome: string }[] = []) => {
  const base = { icone: 'tag', cor: '#112233', fixa: false, arquivado: false, tipo: 'despesa' as const }
  return {
    ...base,
    id,
    nome,
    categoria_pai_id: null,
    subcategorias: subs.map((s) => ({ ...base, ...s, categoria_pai_id: id })),
  }
}
const CATEGORIAS = [categoria(10, 'Gastos variáveis', [{ id: 11, nome: 'Mercado' }])]

function lancamento(sobre: Partial<LancamentoSaida> = {}): LancamentoSaida {
  return {
    id: 10,
    tipo: 'despesa',
    valor: '100.00',
    data: '2026-10-05',
    situacao: 'confirmada',
    descricao: 'Padaria',
    categoria: { id: 11, nome: 'Mercado', pai_nome: 'Gastos variáveis', cor: '#112233', icone: 'tag' },
    dono_usuario_id: 1,
    conta_id: 1,
    conta_destino_id: null,
    aporte: false,
    tags: [],
    observacao: null,
    criado_por: { id: 1, nome: 'Ana' },
    criado_em: '2026-10-01T10:00:00',
    recorrente: false,
    recorrencia_id: null,
    numero_recorrencia: null,
    total_ocorrencias: null,
    meta: null,
    ...sobre,
  }
}
const item = (sobre: Partial<LancamentoSaida> = {}): ItemLancamentoLista => ({
  kind: 'lancamento',
  lancamento: lancamento(sobre),
  conta_nome: 'Conta Ana',
  conta_destino_nome: null,
  rotulo: 'Despesa',
  meta: null,
})
const dia = (data: string, itens: DiaLista['itens'], saldo: string): DiaLista => ({ data, itens, saldo_fim_do_dia: saldo })

const RESUMO = {
  entradas: par('10000.00', '6000.00'),
  saidas: par('3000.00', '1700.00'),
  saldo: par('7000.00', '4300.00'),
  saldo_atual_total: '4350.00',
}
function lista(dias: DiaLista[], sobre: Partial<ListaControle> = {}): ListaControle {
  return { mes: '2026-10', filtros_ativos: false, resumo: RESUMO, dias, ...sobre }
}

const PROPORCAO: ProporcaoSaida = {
  mes: '2026-10',
  base_despesas_casal: '3000.00',
  origem_porcentagem: 'mes',
  mes_origem: null,
  pessoas: [
    { usuario_id: 1, nome: 'Ana', porcentagem: '60.00', devido: '1800.00', aportado: '1300.00', faltante: '500.00', excedente: '0.00' },
    { usuario_id: 2, nome: 'Bruno', porcentagem: '40.00', devido: '1200.00', aportado: '1200.00', faltante: '0.00', excedente: '0.00' },
  ],
}

const DIAS_PADRAO = [
  dia('2026-10-05', [item()], '900.00'),
  dia('2026-10-20', [{ kind: 'fatura', data: '2026-10-20', fatura: FATURA }], '100.00'),
]

function rotas(sobre: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    'GET /api/controle/lista': json(lista(DIAS_PADRAO)),
    'GET /api/proporcao': json(PROPORCAO),
    'GET /api/contas': json(LISTAGEM_CONTAS),
    'GET /api/categorias': json(CATEGORIAS),
    'GET /api/cartoes': json(LISTA_CARTOES),
    'GET /api/tags': json([]),
    ...sobre,
  }
}

const listas = (api: { chamadasDe(c: string): Chamada[] }) => api.chamadasDe('GET /api/controle/lista')
const ultima = (api: { chamadasDe(c: string): Chamada[] }) => listas(api).at(-1)!

describe('Controle: topo, lista e navegação (CA-5.04, CA-5.05, CA-5.06, CA-5.07)', () => {
  it('mostra saldo atual total, entradas, saídas, saldo do mês e os cards de proporção e aporte (CA-5.04)', async () => {
    simularApi(rotas())
    renderizarApp('/controle')
    const total = (await screen.findByRole('heading', { name: 'Saldo atual total' })).closest('section') as HTMLElement
    expect(total).toHaveTextContent('R$ 4.350,00')
    const entradas = screen.getByRole('heading', { name: 'Entradas' }).closest('section') as HTMLElement
    expect(entradas).toHaveTextContent('+R$ 10.000,00')
    expect(entradas).toHaveTextContent('+R$ 6.000,00')
    const saidas = screen.getByRole('heading', { name: 'Saídas' }).closest('section') as HTMLElement
    expect(saidas).toHaveTextContent('-R$ 3.000,00')
    expect(saidas).toHaveTextContent('-R$ 1.700,00')
    const saldo = screen.getByRole('heading', { name: 'Saldo do mês' }).closest('section') as HTMLElement
    expect(saldo).toHaveTextContent('R$ 7.000,00')
    expect(saldo).toHaveTextContent('R$ 4.300,00')

    const ana = (await screen.findByRole('heading', { name: 'Ana' })).closest('section') as HTMLElement
    expect(ana).toHaveTextContent('60')
    expect(ana).toHaveTextContent('R$ 1.800,00')
    expect(ana).toHaveTextContent('R$ 1.300,00')
    expect(ana).toHaveTextContent('R$ 500,00')
    expect(screen.getByRole('heading', { name: 'Bruno' })).toBeInTheDocument()
  })

  it('trocar o mês no seletor reconsulta lista e proporção do novo mês e atualiza os cards (CA-5.04)', async () => {
    const api = simularApi(
      rotas({
        'GET /api/controle/lista': ({ params }) =>
          json(
            params.mes === '2026-09'
              ? lista([], { mes: '2026-09', resumo: { ...RESUMO, saldo_atual_total: '1.00', entradas: par('1.00', '1.00') } })
              : lista(DIAS_PADRAO),
          ),
      }),
    )
    const { user } = renderizarApp('/controle')
    await screen.findByText('outubro de 2026')
    await user.click(screen.getByRole('button', { name: 'mês anterior' }))
    await screen.findByText('setembro de 2026')
    await waitFor(() => expect(ultima(api).params.mes).toBe('2026-09'))
    await waitFor(() =>
      expect(api.chamadasDe('GET /api/proporcao').map((c) => c.params.mes)).toContain('2026-09'),
    )
    const total = screen.getByRole('heading', { name: 'Saldo atual total' }).closest('section') as HTMLElement
    await waitFor(() => expect(total).toHaveTextContent('R$ 1,00'))
  })

  it('sem vínculo a proporção falha e só os cards de pessoa somem; a lista continua', async () => {
    simularApi(rotas({ 'GET /api/proporcao': erroApi(409, 'SEM_VINCULO', 'Sem vínculo.') }))
    renderizarApp('/controle')
    expect(await screen.findByText('Padaria')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Bruno' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Saldo atual total' })).toBeInTheDocument()
  })

  it('lista o mês agrupado por dia com saldo do fim do dia e a linha da fatura (CA-5.05, CA-5.06, CA-5.07)', async () => {
    simularApi(rotas())
    renderizarApp('/controle')
    expect(await screen.findByRole('heading', { name: '05/10/2026' })).toBeInTheDocument()
    expect(screen.getByText('Padaria')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '20/10/2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Nubank/ })).toBeInTheDocument()
    expect(screen.getByText('R$ 900,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 100,00', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getAllByText(/Saldo do fim do dia/)).toHaveLength(2)
  })

  it('os atalhos do Controle levam às telas com o mês', async () => {
    simularApi(rotas())
    renderizarApp('/controle?mes=2026-08')
    const nav = await screen.findByRole('navigation', { name: 'Atalhos do controle' })
    const alvo = (nome: string) => within(nav).getByRole('link', { name: nome }).getAttribute('href')
    expect(alvo('Contas')).toBe('/controle/contas')
    expect(alvo('Categorias')).toBe('/controle/categorias')
    expect(alvo('Tags')).toBe('/controle/tags')
    expect(alvo('Proporção')).toBe('/controle/proporcao?mes=2026-08')
    expect(alvo('Balanço')).toBe('/controle/balanco?mes=2026-08')
    expect(alvo('Relatórios')).toBe('/controle/relatorios?mes=2026-08')
    expect(alvo('Projeção')).toBe('/projecao')
  })

  it('o atalho "Balanço" abre a tela de balanço', async () => {
    simularApi(rotas({ 'GET /api/balanco': json({ mes: '2026-10', total: { entradas: ZERO, saidas: ZERO, saldo: ZERO }, contas: [], donos: [] }) }))
    const { user } = renderizarApp('/controle')
    const nav = await screen.findByRole('navigation', { name: 'Atalhos do controle' })
    await user.click(within(nav).getByRole('link', { name: 'Balanço' }))
    expect(await screen.findByRole('heading', { name: 'Balanço do mês' })).toBeInTheDocument()
  })

  it('tocar na linha da fatura abre o detalhe da fatura do cartão e mês (CA-5.06)', async () => {
    const api = simularApi(rotas())
    const { user } = renderizarApp('/controle')
    await user.click(await screen.findByRole('button', { name: /Nubank/ }))
    await waitFor(() => expect(api.chamadasDe('GET /api/cartoes/7/faturas/2026-10')).not.toHaveLength(0))
  })

  it('mês sem lançamentos e sem filtros mostra o estado vazio, sem "Limpar filtros" (CA-5.13, CA-0.07)', async () => {
    simularApi(rotas({ 'GET /api/controle/lista': json(lista([])) }))
    renderizarApp('/controle')
    expect(await screen.findByText('Nenhum lançamento para mostrar.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull()
  })

  it('erro ao carregar a lista mostra alerta', async () => {
    simularApi(rotas({ 'GET /api/controle/lista': erroApi(400, 'VALIDACAO', 'Mês inválido.') }))
    renderizarApp('/controle')
    expect(await screen.findByRole('alert')).toHaveTextContent('Mês inválido.')
  })
})

describe('Controle: atalhos, filtros e limpar (CA-5.08, CA-5.09, CA-5.10, CA-5.13)', () => {
  it.each([
    ['Despesas', ['despesa_conta', 'despesa_cartao']],
    ['Receitas', ['receita']],
    ['Transferências', ['transferencia', 'aporte']],
  ])('atalho "%s" consulta a lista com os tipos do atalho', async (rotulo, tipos) => {
    const api = simularApi(rotas())
    const { user } = renderizarApp('/controle')
    await screen.findByText('Padaria')
    await user.click(screen.getByRole('button', { name: rotulo }))
    await waitFor(() => expect(ultima(api).params.tipo).toBeDefined())
    // Chamada.params guarda só um valor por chave: os tipos repetidos saem das URLs do fetch.
    const urls = vi.mocked(fetch).mock.calls.map(([u]) => new URL(String(u), 'http://x'))
    const consulta = urls.filter((u) => u.pathname === '/api/controle/lista').at(-1)!
    expect(consulta.searchParams.getAll('tipo').sort()).toEqual([...tipos].sort())
    expect(screen.getByRole('button', { name: rotulo, pressed: true })).toBeInTheDocument()
  })

  it('"Aplicar" no sheet consulta a lista com o filtro escolhido e mostra o chip', async () => {
    const api = simularApi(rotas())
    const { user } = renderizarApp('/controle')
    await screen.findByText('Padaria')
    await user.click(screen.getByRole('button', { name: 'Filtros' }))
    const sheet = await screen.findByRole('dialog', { name: 'Filtros' })
    await user.click(within(sheet).getByLabelText('Casal'))
    await user.click(within(sheet).getByLabelText('Atrasada'))
    await user.click(within(sheet).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(ultima(api).params.dono).toBe('casal'))
    expect(ultima(api).params.situacao).toBe('atrasada')
    expect(ultima(api).params.mes).toBe('2026-10')
    expect(screen.getByRole('button', { name: 'Remover filtro Casal' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remover filtro Atrasada' })).toBeInTheDocument()
  })

  it('o sheet oferece as contas, as categorias com subcategorias e os cartões', async () => {
    simularApi(rotas())
    const { user } = renderizarApp('/controle')
    await screen.findByText('Padaria')
    await user.click(screen.getByRole('button', { name: 'Filtros' }))
    const sheet = await screen.findByRole('dialog', { name: 'Filtros' })
    await within(sheet).findByLabelText('Conta Ana')
    expect(within(sheet).getByLabelText('Conta Conjunta')).toBeInTheDocument()
    expect(within(sheet).getByLabelText('Gastos variáveis')).toBeInTheDocument()
    expect(within(sheet).getByLabelText('Gastos variáveis / Mercado')).toBeInTheDocument()
    expect(within(sheet).getByLabelText('Nubank')).toBeInTheDocument()
    expect(within(sheet).getByLabelText('Ana')).toBeInTheDocument()
    expect(within(sheet).getByLabelText('Bruno')).toBeInTheDocument()
  })

  it('o filtro da URL é enviado à lista e o chip mostra o nome da opção (dono, conta, categoria-mãe)', async () => {
    const api = simularApi(rotas())
    renderizarApp('/controle?dono=1&dono=casal&conta_id=2&categoria_id=10')
    await screen.findByRole('button', { name: 'Remover filtro Casal' })
    expect(screen.getByRole('button', { name: 'Remover filtro Ana' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Remover filtro Conta Conjunta' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Remover filtro Gastos variáveis' })).toBeInTheDocument()
    const consulta = new URL(`http://x/?${new URLSearchParams(ultima(api).params)}`)
    expect(consulta.searchParams.get('conta_id')).toBe('2')
    expect(consulta.searchParams.get('categoria_id')).toBe('10')
  })

  it('o card de saídas do topo acompanha a resposta filtrada', async () => {
    simularApi(
      rotas({
        'GET /api/controle/lista': ({ params }) =>
          json(
            params.situacao === 'atrasada'
              ? lista([dia('2026-10-05', [item({ situacao: 'atrasada' })], '0.00')], {
                  filtros_ativos: true,
                  resumo: { ...RESUMO, saidas: par('100.00', '0.00') },
                })
              : lista(DIAS_PADRAO),
          ),
      }),
    )
    renderizarApp('/controle?situacao=atrasada')
    const saidas = (await screen.findByRole('heading', { name: 'Saídas' })).closest('section') as HTMLElement
    await waitFor(() => expect(saidas).toHaveTextContent('-R$ 100,00'))
    expect(screen.getByText('Atrasada', { selector: 'span' })).toBeInTheDocument()
  })

  it('filtros sem resultado mostram a frase e "Limpar filtros"; ao tocar, todos saem e a lista completa volta (CA-5.13)', async () => {
    const api = simularApi(
      rotas({
        'GET /api/controle/lista': ({ params }) =>
          json(params.dono ? lista([], { filtros_ativos: true }) : lista(DIAS_PADRAO)),
      }),
    )
    const { user } = renderizarApp('/controle?mes=2026-10&dono=2&situacao=prevista')
    expect(await screen.findByText('Nenhum lançamento com esses filtros')).toBeInTheDocument()
    // "Limpar filtros" aparece na barra de chips e no estado vazio.
    const botoes = screen.getAllByRole('button', { name: 'Limpar filtros' })
    expect(botoes.length).toBeGreaterThanOrEqual(1)
    await user.click(within(screen.getByText('Nenhum lançamento com esses filtros').parentElement as HTMLElement).getByRole('button', { name: 'Limpar filtros' }))
    expect(await screen.findByText('Padaria')).toBeInTheDocument()
    expect(screen.queryByText('Nenhum lançamento com esses filtros')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull()
    expect(ultima(api).params.dono).toBeUndefined()
    expect(ultima(api).params.situacao).toBeUndefined()
    expect(ultima(api).params.mes).toBe('2026-10')
  })

  it('"Limpar filtros" da barra de chips também restaura a lista completa', async () => {
    const api = simularApi(rotas())
    const { user } = renderizarApp('/controle?conta_id=1&tipo=receita')
    await user.click(await screen.findByRole('button', { name: 'Limpar filtros' }))
    await waitFor(() => expect(ultima(api).params.conta_id).toBeUndefined())
    expect(ultima(api).params.tipo).toBeUndefined()
  })
})

describe('Controle: fechar o sheet de filtros (t185 I1, t185c)', () => {
  async function abrirEEscolher(user: ReturnType<typeof renderizarApp>['user']) {
    await screen.findByText('Padaria')
    await user.click(screen.getByRole('button', { name: 'Filtros' }))
    const sheet = await screen.findByRole('dialog', { name: 'Filtros' })
    await within(sheet).findByLabelText('Conta Ana')
    await user.click(within(sheet).getByLabelText('Conta Ana'))
  }

  it('fechar pelo X descarta a escolha: nenhuma consulta filtrada e nenhum chip', async () => {
    const api = simularApi(rotas())
    const { user } = renderizarApp('/controle')
    await abrirEEscolher(user)
    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await new Promise((r) => setTimeout(r, 30))
    expect(listas(api).every((c) => c.params.conta_id === undefined)).toBe(true)
    expect(screen.queryByRole('button', { name: /Remover filtro/ })).toBeNull()
  })

  it('fechar com Esc descarta a escolha', async () => {
    const api = simularApi(rotas())
    const { user } = renderizarApp('/controle')
    await abrirEEscolher(user)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await new Promise((r) => setTimeout(r, 30))
    expect(listas(api).every((c) => c.params.conta_id === undefined)).toBe(true)
  })

  it('fechar com Voltar do navegador descarta a escolha e mantém o filtro já aplicado', async () => {
    const api = simularApi(rotas())
    const { user } = renderizarApp('/controle?situacao=prevista')
    await abrirEEscolher(user)
    window.history.back()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await new Promise((r) => setTimeout(r, 30))
    expect(listas(api).every((c) => c.params.conta_id === undefined)).toBe(true)
    expect(screen.getByRole('button', { name: 'Remover filtro Prevista' })).toBeInTheDocument()
  })

  it('"Aplicar" mantém o filtro depois que o histórico do sheet é desfeito', async () => {
    const api = simularApi(rotas())
    const { user } = renderizarApp('/controle')
    await abrirEEscolher(user)
    await user.click(screen.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(ultima(api).params.conta_id).toBe('1'))
    await new Promise((r) => setTimeout(r, 50))
    expect(ultima(api).params.conta_id).toBe('1')
    expect(screen.getByRole('button', { name: 'Remover filtro Conta Ana' })).toBeInTheDocument()
  })
})

describe('Controle: ações da lista (CA-5.12)', () => {
  it('"Confirmar" de despesa prevista permite ajustar o valor real e confirma', async () => {
    const api = simularApi(
      rotas({
        'GET /api/controle/lista': json(
          lista([dia('2026-10-05', [item({ situacao: 'prevista', valor: '100.00' })], '0.00')]),
        ),
        'POST /api/lancamentos/10/confirmar': ({ corpo }) => json(lancamento({ situacao: 'confirmada', valor: (corpo as { valor: string }).valor })),
      }),
    )
    const { user } = renderizarApp('/controle')
    await user.click(await screen.findByRole('button', { name: 'Confirmar' }))
    const dialogo = await screen.findByRole('dialog')
    const campo = within(dialogo).getByRole('textbox')
    expect(campo).toHaveValue('100,00')
    await user.clear(campo)
    await user.type(campo, '9050')
    await user.click(within(dialogo).getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(api.chamadasDe('POST /api/lancamentos/10/confirmar')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/lancamentos/10/confirmar')[0]!.corpo).toEqual({ valor: '90.50' })
  })

  it('lançamento já confirmado não oferece "Confirmar"', async () => {
    simularApi(rotas())
    renderizarApp('/controle')
    await screen.findByText('Padaria')
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull()
  })

  it('a linha da fatura não oferece Editar, Excluir nem Confirmar', async () => {
    simularApi(rotas({ 'GET /api/controle/lista': json(lista([dia('2026-10-20', [{ kind: 'fatura', data: '2026-10-20', fatura: FATURA }], '0.00')])) }))
    renderizarApp('/controle')
    await screen.findByRole('button', { name: /Nubank/ })
    for (const nome of ['Confirmar', 'Editar', 'Excluir']) {
      expect(screen.queryByRole('button', { name: nome })).toBeNull()
    }
  })

  it('Excluir de lançamento simples pede confirmação e exclui', async () => {
    const api = simularApi(rotas({ 'DELETE /api/lancamentos/10': { status: 204 } }))
    const { user } = renderizarApp('/controle')
    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    const dialogo = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'))
    await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(api.chamadasDe('DELETE /api/lancamentos/10')).toHaveLength(1))
    expect(api.chamadasDe('DELETE /api/lancamentos/10')[0]!.params.alcance).toBeUndefined()
  })

  it('Excluir de lançamento recorrente pergunta o alcance e o envia na exclusão', async () => {
    const api = simularApi(
      rotas({
        'GET /api/controle/lista': json(lista([dia('2026-10-05', [item({ recorrente: true, recorrencia_id: 3, numero_recorrencia: 1, total_ocorrencias: 12 })], '0.00')])),
        'DELETE /api/lancamentos/10': { status: 204 },
      }),
    )
    const { user } = renderizarApp('/controle')
    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir lançamento recorrente' })
    await user.click(within(dialogo).getByRole('button', { name: 'Este e os pendentes' }))
    await waitFor(() => expect(api.chamadasDe('DELETE /api/lancamentos/10')).toHaveLength(1))
    expect(api.chamadasDe('DELETE /api/lancamentos/10')[0]!.params.alcance).toBe('este_e_pendentes')
  })

  it('Editar de lançamento recorrente pergunta o alcance antes de abrir o formulário', async () => {
    simularApi(
      rotas({
        'GET /api/controle/lista': json(lista([dia('2026-10-05', [item({ recorrente: true, recorrencia_id: 3, numero_recorrencia: 1, total_ocorrencias: 12 })], '0.00')])),
      }),
    )
    simularResizeObserver()
    const { user } = renderizarApp('/controle')
    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    expect(await screen.findByRole('dialog', { name: 'Editar lançamento recorrente' })).toBeInTheDocument()
  })

  it('tocar no lançamento abre o detalhe', async () => {
    simularApi(rotas())
    const { user } = renderizarApp('/controle')
    await user.click(await screen.findByRole('button', { name: /Padaria/ }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})

describe('Controle: compra no cartão aberta a partir do Controle (t185 B1, t185c)', () => {
  function clienteComCache30s() {
    return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
  }

  async function abrirCompraNoCartao(user: ReturnType<typeof renderizarApp>['user']) {
    await user.click(screen.getByRole('button', { name: 'Novo lançamento' }))
    await user.click(await screen.findByRole('button', { name: 'Despesa no cartão' }))
  }

  it('logo depois de carregar o Controle (cache fresco), o formulário lista o cartão e não diz "sem cartão"', async () => {
    simularResizeObserver()
    simularApi(rotas())
    const { user } = renderizarApp('/controle', { cliente: clienteComCache30s() })
    await screen.findByText('Padaria')
    await abrirCompraNoCartao(user)
    const select = await screen.findByRole('combobox', { name: /Cartão/ })
    await within(select).findByRole('option', { name: 'Nubank' })
    expect(screen.queryByText(/Cadastre um cartão antes/)).toBeNull()
    expect(screen.getByRole('heading', { name: 'Controle' })).toBeInTheDocument()
  })

  it('depois de 30 s (cache vencido) o formulário refaz a consulta, lista o cartão e o Controle não quebra', async () => {
    simularResizeObserver()
    fixarHoje('2026-10-15')
    const api = simularApi(rotas())
    const { user } = renderizarApp('/controle', { cliente: clienteComCache30s() })
    await screen.findByText('Padaria')
    const antes = api.chamadasDe('GET /api/cartoes').length
    vi.setSystemTime(new Date(Date.now() + 31_000))
    await abrirCompraNoCartao(user)
    const select = await screen.findByRole('combobox', { name: /Cartão/ })
    await within(select).findByRole('option', { name: 'Nubank' })
    await waitFor(() => expect(api.chamadasDe('GET /api/cartoes').length).toBeGreaterThan(antes))
    expect(screen.queryByText(/Cadastre um cartão antes/)).toBeNull()
    // O Controle atrás do formulário continua montado, com as opções de cartão do filtro.
    expect(screen.getByRole('heading', { name: 'Controle' })).toBeInTheDocument()
    expect(screen.getByText('Padaria')).toBeInTheDocument()
  })
})
