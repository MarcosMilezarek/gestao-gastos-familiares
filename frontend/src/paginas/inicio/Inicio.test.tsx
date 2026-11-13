import { cloneElement, type ComponentProps, type ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { FaturaResumo } from '../../api/cartoes'
import type { ItemLancamentoLista } from '../../api/controle'
import type { InicioSaida } from '../../api/inicio'
import type { LancamentoSaida } from '../../api/lancamentos'
import type { ProporcaoSaida } from '../../api/proporcao'
import {
  erroApi,
  json,
  limparTudo,
  renderizarApp,
  simularApi,
  simularResizeObserver,
} from '../../testes/utilitarios'

// O ResponsiveContainer do recharts mede o elemento (0 x 0 no jsdom) e não desenha nada, e a animação
// das fatias não anda no jsdom. Aqui o contêiner repassa um tamanho fixo e o Pie registra os dados
// recebidos, para verificar quais itens viram fatia sem depender de pixel.
const fatiasDesenhadas = vi.hoisted(() => ({ chamadas: [] as { nome: string; valor: number }[][] }))

vi.mock('recharts', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('recharts')>()
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 400, height: 300 }),
    Pie: (props: ComponentProps<typeof original.Pie>) => {
      fatiasDesenhadas.chamadas.push((props.data ?? []) as { nome: string; valor: number }[])
      return <original.Pie {...props} />
    },
  }
})

const nomesDasFatias = () => (fatiasDesenhadas.chamadas.at(-1) ?? []).map((fatia) => fatia.nome)

// O BottomSheet chama history.back() ao desmontar (popstate assíncrono).
afterEach(async () => {
  limparTudo()
  fatiasDesenhadas.chamadas.length = 0
  await new Promise((r) => setTimeout(r, 10))
})

const brl = (valor: string) => new RegExp(`R\\$\\s${valor.replace(/\./g, '\\.')}`)

const PROPORCAO: ProporcaoSaida = {
  mes: '2026-10',
  base_despesas_casal: '1000.00',
  origem_porcentagem: 'mes',
  mes_origem: null,
  pessoas: [
    { usuario_id: 1, nome: 'Ana', porcentagem: '60.00', devido: '600.00', aportado: '100.00', faltante: '500.00', excedente: '0.00' },
    { usuario_id: 2, nome: 'Bruno', porcentagem: '40.00', devido: '400.00', aportado: '450.00', faltante: '0.00', excedente: '50.00' },
  ],
}

function lancamento(sobre: Partial<LancamentoSaida>): LancamentoSaida {
  return {
    id: 10,
    tipo: 'despesa',
    valor: '100.00',
    data: '2026-10-15',
    situacao: 'prevista',
    descricao: 'Conta de luz',
    categoria: null,
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

const pendente = (sobre: Partial<LancamentoSaida>): ItemLancamentoLista => ({
  kind: 'lancamento',
  lancamento: lancamento(sobre),
  conta_nome: 'Conta Ana',
  conta_destino_nome: null,
  rotulo: 'Despesa',
  meta: null,
})

const par = (previsto: string, realizado: string) => ({ previsto, realizado })

function fatura(sobre: Partial<FaturaResumo>): FaturaResumo {
  return {
    cartao_id: 7,
    cartao_nome: 'Nubank',
    conta_id: 2,
    mes: '2026-10',
    id: 70,
    status: 'aberta',
    fechamento: '2026-10-10',
    vencimento: '2026-10-20',
    valor: '800.00',
    pagamento: null,
    ...sobre,
  }
}

const MESES = ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']

function inicioCheio(sobre: Partial<InicioSaida> = {}): InicioSaida {
  return {
    mes: '2026-10',
    hoje: '2026-10-15',
    cards: {
      saldos: [
        { conta_id: 1, nome: 'Conta Ana', dono_usuario_id: 1, saldo_atual: '4900.00' },
        { conta_id: 2, nome: 'Conta Conjunta', dono_usuario_id: null, saldo_atual: '1000.00' },
        { conta_id: 3, nome: 'Conta Bruno', dono_usuario_id: 2, saldo_atual: '50.00' },
      ],
      total_faturas_mes: '1000.00',
    },
    proporcao: PROPORCAO,
    pendentes: [
      pendente({ id: 11, descricao: 'Aluguel atrasado', data: '2026-08-15', situacao: 'atrasada', valor: '700.00' }),
      pendente({ id: 10, descricao: 'Conta de luz', data: '2026-10-15', situacao: 'prevista', valor: '100.00' }),
    ],
    despesas_por_categoria: {
      mes: '2026-10',
      total: '3000.00',
      categorias: [
        { categoria_id: 10, nome: 'Moradia', icone: 'home', cor: '#112233', valor: '2000.00', valor_direto: '2000.00', porcentagem: '66.67', subcategorias: [] },
        { categoria_id: 20, nome: 'Lazer', icone: 'tag', cor: '#445566', valor: '1000.00', valor_direto: '1000.00', porcentagem: '33.33', subcategorias: [] },
      ],
    },
    balanco_contas: [
      {
        conta_id: 1,
        nome: 'Conta Ana',
        dono_usuario_id: 1,
        entradas: par('5000.00', '5000.00'),
        saidas: par('300.00', '100.00'),
        transferencias_entrada: par('0.00', '0.00'),
        transferencias_saida: par('0.00', '0.00'),
        saldo: par('4700.00', '4900.00'),
        saldo_atual: '4900.00',
        saldo_previsto: '4700.00',
      },
    ],
    proximas_faturas: [
      fatura({}),
      fatura({ cartao_id: 8, cartao_nome: 'Itaú', conta_id: 2, vencimento: '2026-10-25', valor: '200.00', status: 'fechada', id: 80 }),
    ],
    projecao: {
      conta_id: null,
      horizonte: 6,
      meses: MESES.map((mes, i) => ({
        mes,
        previsto: i > 0,
        entradas: '0.00',
        saidas: '0.00',
        transferencias_entrada: '0.00',
        transferencias_saida: '0.00',
        pagamentos_fatura: '0.00',
        aplicacoes_menos_resgates: '0.00',
        saldo_previsto: `${7050 - i * 100}.00`,
      })),
    },
    ...sobre,
  }
}

const INICIO_VAZIO: InicioSaida = {
  mes: '2026-10',
  hoje: '2026-10-15',
  cards: { saldos: [], total_faturas_mes: '0.00' },
  proporcao: null,
  pendentes: [],
  despesas_por_categoria: { mes: '2026-10', total: '0.00', categorias: [] },
  balanco_contas: [],
  proximas_faturas: [],
  projecao: { conta_id: null, horizonte: 6, meses: [] },
}

function bloco(titulo: string): HTMLElement {
  const secao = screen.getByRole('heading', { level: 2, name: titulo }).closest('section')
  if (!secao) throw new Error(`bloco ${titulo} não encontrado`)
  return secao
}

async function blocoPronto(titulo: string): Promise<HTMLElement> {
  const secao = (await screen.findByRole('heading', { level: 2, name: titulo })).closest('section')
  if (!secao) throw new Error(`bloco ${titulo} não encontrado`)
  return secao
}

const TITULOS_DOS_BLOCOS = [
  'Saldos e faturas do mês',
  'Proporção e aporte',
  'A confirmar e atrasadas',
  'Despesas por categoria',
  'Balanço do mês por conta',
  'Próximas faturas',
  'Projeção de saldo',
]

describe('Início: os 7 blocos (CA-5.14)', () => {
  it('mostra os 7 blocos na ordem definida, sem seletor de mês nem controles de blocos', async () => {
    simularApi({ 'GET /api/inicio': json(inicioCheio()) })
    simularResizeObserver()
    renderizarApp('/')

    await screen.findByRole('heading', { level: 2, name: TITULOS_DOS_BLOCOS[0] })
    const titulos = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    const principais = titulos.filter((t) => TITULOS_DOS_BLOCOS.includes(t ?? ''))
    expect(principais).toEqual(TITULOS_DOS_BLOCOS)

    expect(screen.queryByRole('button', { name: 'mês anterior' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'próximo mês' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ocultar|reordenar|adicionar bloco/i })).not.toBeInTheDocument()
  })

  it('consulta /api/inicio sem parâmetro de mês', async () => {
    const api = simularApi({ 'GET /api/inicio': json(inicioCheio()) })
    simularResizeObserver()
    renderizarApp('/')
    await screen.findByRole('heading', { level: 2, name: TITULOS_DOS_BLOCOS[0] })
    expect(api.chamadasDe('GET /api/inicio')[0]?.params).toEqual({})
  })
})

describe('Início: cards de saldo e faturas (CA-5.15)', () => {
  it('mostra o saldo atual de cada conta e o total de faturas do mês', async () => {
    simularApi({ 'GET /api/inicio': json(inicioCheio()) })
    simularResizeObserver()
    renderizarApp('/')

    const saldos = await blocoPronto('Saldos e faturas do mês')
    const cardDe = (nome: string) => within(saldos).getByRole('heading', { level: 3, name: nome }).closest('section') as HTMLElement
    expect(cardDe('Conta Conjunta')).toHaveTextContent(brl('1.000,00'))
    expect(cardDe('Conta Ana')).toHaveTextContent(brl('4.900,00'))
    expect(cardDe('Conta Bruno')).toHaveTextContent(brl('50,00'))
    expect(cardDe('Faturas do mês')).toHaveTextContent(brl('1.000,00'))
  })
})

describe('Início: proporção e aporte (CA-5.16)', () => {
  it('mostra porcentagem, devido, aportado e faltante de cada pessoa', async () => {
    simularApi({ 'GET /api/inicio': json(inicioCheio()) })
    simularResizeObserver()
    renderizarApp('/')

    const proporcao = await blocoPronto('Proporção e aporte')
    await within(proporcao).findByRole('heading', { name: 'Ana' })
    const ana = within(proporcao).getByRole('heading', { name: 'Ana' }).closest('section') as HTMLElement
    expect(ana).toHaveTextContent('60,00%')
    expect(ana).toHaveTextContent(brl('600,00'))
    expect(ana).toHaveTextContent(brl('100,00'))
    expect(ana).toHaveTextContent(brl('500,00'))
    expect(ana).toHaveTextContent('Faltante')
    expect(proporcao).toHaveTextContent('40,00%')
  })

  it('porcentagem herdada informa o mês de origem e sem Salário anterior informa 50% para cada', async () => {
    simularApi({
      'GET /api/inicio': json(
        inicioCheio({ proporcao: { ...PROPORCAO, origem_porcentagem: 'herdada', mes_origem: '2026-09' } }),
      ),
    })
    simularResizeObserver()
    const primeiro = renderizarApp('/')
    expect(await screen.findByText('Porcentagem herdada de setembro de 2026')).toBeInTheDocument()
    primeiro.unmount()

    simularApi({
      'GET /api/inicio': json(inicioCheio({ proporcao: { ...PROPORCAO, origem_porcentagem: 'padrao_50_50' } })),
    })
    renderizarApp('/')
    expect(await screen.findByText('50% para cada, por falta de Salário no histórico')).toBeInTheDocument()
  })

  it('"Fazer aporte" de Ana abre a transferência da conta de Ana para a conjunta, com data de hoje', async () => {
    simularApi({
      'GET /api/inicio': json(inicioCheio()),
      'GET /api/contas': json({
        mes: '2026-10',
        contas: [
          { id: 1, nome: 'Conta Ana', dono_usuario_id: 1 },
          { id: 2, nome: 'Conta Conjunta', dono_usuario_id: null },
          { id: 3, nome: 'Conta Bruno', dono_usuario_id: 2 },
        ].map((c) => ({
          instituicao: null, tipo: 'conta_corrente', cor: '#336699', saldo_inicial: '0.00', arquivado: false,
          casal_encerrado: false, saldo_atual: '0.00', saldo_previsto: '0.00', ...c,
        })),
        total_saldo_atual: null,
        total_saldo_previsto: null,
      }),
      'GET /api/tags': json([]),
      'GET /api/proporcao/sugestao-aporte': json({ valor: '500.00' }),
    })
    simularResizeObserver()
    const { user } = renderizarApp('/')

    const ana = (await within(await blocoPronto('Proporção e aporte')).findByRole('heading', { name: 'Ana' })).closest('section') as HTMLElement
    await user.click(within(ana).getByRole('button', { name: 'Fazer aporte' }))

    const dialogo = await screen.findByRole('dialog', { name: 'Nova transferência' })
    expect(within(dialogo).getByLabelText('Conta de origem')).toHaveDisplayValue('Conta Ana')
    expect(within(dialogo).getByLabelText('Conta de destino')).toHaveDisplayValue('Conta Conjunta')
    expect(within(dialogo).getByLabelText('Data')).toHaveValue('2026-10-15')
  })

  it('"Fazer aporte" de Bruno abre a transferência da conta de Bruno para a conjunta', async () => {
    simularApi({
      'GET /api/inicio': json(inicioCheio()),
      'GET /api/contas': json({
        mes: '2026-10',
        contas: [
          { id: 1, nome: 'Conta Ana', dono_usuario_id: 1 },
          { id: 2, nome: 'Conta Conjunta', dono_usuario_id: null },
          { id: 3, nome: 'Conta Bruno', dono_usuario_id: 2 },
        ].map((c) => ({
          instituicao: null, tipo: 'conta_corrente', cor: '#336699', saldo_inicial: '0.00', arquivado: false,
          casal_encerrado: false, saldo_atual: '0.00', saldo_previsto: '0.00', ...c,
        })),
        total_saldo_atual: null,
        total_saldo_previsto: null,
      }),
      'GET /api/tags': json([]),
      'GET /api/proporcao/sugestao-aporte': json({ valor: null }),
    })
    simularResizeObserver()
    const { user } = renderizarApp('/')

    const bruno = (await within(await blocoPronto('Proporção e aporte')).findByRole('heading', { name: 'Bruno' })).closest('section') as HTMLElement
    await user.click(within(bruno).getByRole('button', { name: 'Fazer aporte' }))

    const dialogo = await screen.findByRole('dialog', { name: 'Nova transferência' })
    expect(within(dialogo).getByLabelText('Conta de origem')).toHaveDisplayValue('Conta Bruno')
    expect(within(dialogo).getByLabelText('Conta de destino')).toHaveDisplayValue('Conta Conjunta')
  })
})

describe('Início: a confirmar e atrasadas (CA-5.17)', () => {
  it('lista os pendentes na ordem recebida (o atrasado primeiro) e não lista fatura', async () => {
    simularApi({ 'GET /api/inicio': json(inicioCheio()) })
    simularResizeObserver()
    renderizarApp('/')

    const pendentes = await blocoPronto('A confirmar e atrasadas')
    await within(pendentes).findByText('Aluguel atrasado')
    const textos = within(pendentes).getAllByRole('listitem').map((li) => li.textContent ?? '')
    expect(textos).toHaveLength(2)
    expect(textos[0]).toContain('Aluguel atrasado')
    expect(textos[1]).toContain('Conta de luz')
    expect(pendentes).not.toHaveTextContent('Nubank')
  })

  it('"Confirmar" retira o lançamento do bloco e o Início é consultado de novo', async () => {
    let confirmado = false
    const api = simularApi({
      'GET /api/inicio': () =>
        json(
          confirmado
            ? inicioCheio({ pendentes: [pendente({ id: 11, descricao: 'Aluguel atrasado', data: '2026-08-15', situacao: 'atrasada', valor: '700.00' })] })
            : inicioCheio(),
        ),
      'POST /api/lancamentos/10/confirmar': () => {
        confirmado = true
        return json(lancamento({ id: 10, situacao: 'confirmada' }))
      },
    })
    simularResizeObserver()
    const { user } = renderizarApp('/')

    const pendentes = await blocoPronto('A confirmar e atrasadas')
    const linha = (await within(pendentes).findByText('Conta de luz')).closest('li') as HTMLElement
    await user.click(within(linha).getByRole('button', { name: 'Confirmar' }))

    const dialogo = await screen.findByRole('dialog', { name: 'Confirmar lançamento' })
    expect(within(dialogo).getByLabelText('Valor real')).toHaveValue('100,00')
    await user.click(within(dialogo).getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(within(bloco('A confirmar e atrasadas')).queryByText('Conta de luz')).not.toBeInTheDocument())
    expect(within(bloco('A confirmar e atrasadas')).getByText('Aluguel atrasado')).toBeInTheDocument()
    expect(api.chamadasDe('POST /api/lancamentos/10/confirmar')).toHaveLength(1)
    expect(api.chamadasDe('POST /api/lancamentos/10/confirmar')[0]?.corpo).toEqual({ valor: '100.00' })
    expect(api.chamadasDe('GET /api/inicio').length).toBeGreaterThanOrEqual(2)
  })

  it('sem pendentes mostra a frase do estado vazio', async () => {
    simularApi({ 'GET /api/inicio': json(inicioCheio({ pendentes: [] })) })
    simularResizeObserver()
    renderizarApp('/')
    const pendentes = await blocoPronto('A confirmar e atrasadas')
    expect(await within(pendentes).findByText('Nenhum lançamento a confirmar.')).toBeInTheDocument()
  })
})

describe('Início: despesas por categoria e balanço por conta (CA-5.18)', () => {
  it('mostra valor e porcentagem por categoria em lista de texto e a rosca com texto alternativo', async () => {
    simularApi({ 'GET /api/inicio': json(inicioCheio()) })
    simularResizeObserver()
    renderizarApp('/')

    const despesas = await blocoPronto('Despesas por categoria')
    await within(despesas).findByText('Moradia')
    expect(within(despesas).getByRole('img', { name: 'Distribuição por categoria' })).toBeInTheDocument()
    const moradia = within(despesas).getByText('Moradia').closest('li') as HTMLElement
    expect(moradia).toHaveTextContent(brl('2.000,00'))
    expect(moradia).toHaveTextContent('66,67%')
    const lazer = within(despesas).getByText('Lazer').closest('li') as HTMLElement
    expect(lazer).toHaveTextContent(brl('1.000,00'))
    expect(lazer).toHaveTextContent('33,33%')
  })

  it('mostra um card por conta com previsto e realizado de entradas, saídas e saldo do mês', async () => {
    simularApi({ 'GET /api/inicio': json(inicioCheio()) })
    simularResizeObserver()
    renderizarApp('/')

    const balanco = await blocoPronto('Balanço do mês por conta')
    const card = (await within(balanco).findByRole('heading', { level: 3, name: 'Conta Ana' })).closest('section') as HTMLElement
    const linha = (rotulo: string) => within(card).getByText(rotulo).closest('div') as HTMLElement
    expect(linha('Entradas')).toHaveTextContent('+R$ 5.000,00')
    expect(linha('Saídas')).toHaveTextContent('-R$ 300,00')
    expect(linha('Saídas')).toHaveTextContent('-R$ 100,00')
    expect(linha('Saldo do mês')).toHaveTextContent(brl('4.700,00'))
    expect(linha('Saldo do mês')).toHaveTextContent(brl('4.900,00'))
  })

  it('ajuste de fatura negativo fica na lista mas não vira fatia da rosca (S2 da t193)', async () => {
    simularApi({
      'GET /api/inicio': json(
        inicioCheio({
          despesas_por_categoria: {
            mes: '2026-10',
            total: '950.00',
            categorias: [
              { categoria_id: 10, nome: 'Moradia', icone: 'home', cor: '#112233', valor: '1000.00', valor_direto: '1000.00', porcentagem: '105.26', subcategorias: [] },
              { categoria_id: null, nome: 'Reajuste de fatura', icone: null, cor: null, valor: '-50.00', valor_direto: '-50.00', porcentagem: '-5.26', subcategorias: [] },
            ],
          },
        }),
      ),
    })
    simularResizeObserver()
    renderizarApp('/')

    const despesas = await blocoPronto('Despesas por categoria')
    const ajuste = (await within(despesas).findByText('Reajuste de fatura')).closest('li') as HTMLElement
    expect(ajuste).toHaveTextContent('-R$ 50,00')
    expect(ajuste).toHaveTextContent('-5,26%')
    expect(within(despesas).getByText('Moradia').closest('li')).toHaveTextContent(brl('1.000,00'))
    // Só a categoria de valor positivo desenha fatia.
    expect(nomesDasFatias()).toEqual(['Moradia'])
  })
})

describe('Início: próximas faturas (CA-5.19)', () => {
  it('mostra uma fatura por cartão com nome, valor, vencimento e status, ligadas ao detalhe', async () => {
    simularApi({ 'GET /api/inicio': json(inicioCheio()) })
    simularResizeObserver()
    renderizarApp('/')

    const faturas = await blocoPronto('Próximas faturas')
    const nubank = (await within(faturas).findByText('Nubank')).closest('a') as HTMLElement
    expect(nubank).toHaveTextContent(brl('800,00'))
    expect(nubank).toHaveTextContent('20/10/2026')
    expect(nubank).toHaveTextContent('Aberta')
    expect(nubank).toHaveAttribute('href', '/cartoes/7/faturas/2026-10')

    const itau = within(faturas).getByText('Itaú').closest('a') as HTMLElement
    expect(itau).toHaveTextContent(brl('200,00'))
    expect(itau).toHaveTextContent('25/10/2026')
    expect(itau).toHaveTextContent('Fechada')
    expect(itau).toHaveAttribute('href', '/cartoes/8/faturas/2026-10')
  })

  it('mostra o status Vencida com texto, além da cor', async () => {
    simularApi({
      'GET /api/inicio': json(inicioCheio({ proximas_faturas: [fatura({ status: 'vencida', vencimento: '2026-10-05' })] })),
    })
    simularResizeObserver()
    renderizarApp('/')
    expect(await within(await blocoPronto('Próximas faturas')).findByText('Vencida')).toBeInTheDocument()
  })

  it('tocar na fatura abre o detalhe da fatura', async () => {
    simularApi({
      'GET /api/inicio': json(inicioCheio()),
      'GET /api/cartoes/7/faturas/2026-10': json({
        ...fatura({}), bruto: '800.00', credito_recebido: '0.00', credito_repassado: '0.00',
        itens: [], conta_arquivada: false, pode_pagar: true, editavel: true,
      }),
    })
    simularResizeObserver()
    const { user } = renderizarApp('/')
    await user.click(await screen.findByRole('link', { name: /Nubank/ }))
    await waitFor(() => expect(screen.queryByRole('heading', { level: 2, name: 'Próximas faturas' })).not.toBeInTheDocument())
  })
})

describe('Início: projeção de saldo (CA-5.20)', () => {
  it('mostra 6 saldos mensais a partir do mês corrente e o atalho para a tela de projeção', async () => {
    simularApi({ 'GET /api/inicio': json(inicioCheio()) })
    simularResizeObserver()
    renderizarApp('/')

    const projecao = await blocoPronto('Projeção de saldo')
    await within(projecao).findByText('outubro de 2026')
    const linhas = within(projecao).getAllByRole('listitem')
    expect(linhas).toHaveLength(6)
    expect(linhas[0]).toHaveTextContent('outubro de 2026')
    expect(linhas[0]).toHaveTextContent(brl('7.050,00'))
    expect(linhas[5]).toHaveTextContent('março de 2027')
    expect(linhas[5]).toHaveTextContent(brl('6.550,00'))
    expect(within(projecao).getByRole('link', { name: 'Ver projeção' })).toHaveAttribute('href', '/projecao')
  })

  it('"Ver projeção" abre a tela de projeção', async () => {
    simularApi({
      'GET /api/inicio': json(inicioCheio()),
      'GET /api/contas': json({ mes: '2026-10', contas: [], total_saldo_atual: null, total_saldo_previsto: null }),
      'GET /api/projecao': json(inicioCheio().projecao),
    })
    simularResizeObserver()
    const { user } = renderizarApp('/')
    await user.click(await screen.findByRole('link', { name: 'Ver projeção' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Projeção de saldo' })).toBeInTheDocument()
  })
})

describe('Início: casal sem dados (CA-5.21)', () => {
  it('mantém os 7 blocos, cada um com frase de estado vazio', async () => {
    simularApi({ 'GET /api/inicio': json(INICIO_VAZIO) })
    simularResizeObserver()
    renderizarApp('/')

    await screen.findByRole('heading', { level: 2, name: TITULOS_DOS_BLOCOS[0] })
    for (const titulo of TITULOS_DOS_BLOCOS) {
      expect(screen.getByRole('heading', { level: 2, name: titulo })).toBeInTheDocument()
    }
    expect(within(bloco('Saldos e faturas do mês')).getByText('Nenhuma conta ativa ainda.')).toBeInTheDocument()
    expect(within(bloco('Proporção e aporte')).getByText('Sem casal vinculado, não há proporção para mostrar.')).toBeInTheDocument()
    expect(within(bloco('A confirmar e atrasadas')).getByText('Nenhum lançamento a confirmar.')).toBeInTheDocument()
    expect(within(bloco('Despesas por categoria')).getByText('Nenhuma despesa no mês.')).toBeInTheDocument()
    expect(within(bloco('Balanço do mês por conta')).getByText('Nenhuma conta ativa ainda.')).toBeInTheDocument()
    expect(within(bloco('Próximas faturas')).getByText('Nenhuma fatura em aberto.')).toBeInTheDocument()
    expect(within(bloco('Projeção de saldo')).getByText('Sem projeção para mostrar.')).toBeInTheDocument()
  })

  it('mostra a mensagem do servidor quando a consulta falha', async () => {
    simularApi({
      'GET /api/inicio': erroApi(403, 'PROIBIDO', 'Falha ao carregar o início.'),
    })
    renderizarApp('/')
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao carregar o início.')
  })
})
