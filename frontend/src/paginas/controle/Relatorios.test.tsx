import { cloneElement, type ComponentProps, type ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type {
  CategoriaRelatorio,
  MesBalancoRelatorio,
  RelatorioBalancoMensal,
  RelatorioCategorias,
  RelatorioConta,
  RelatorioDono,
  RelatorioProporcao as RelatorioProporcaoSaida,
} from '../../api/relatorios'
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

afterEach(() => {
  limparTudo()
  fatiasDesenhadas.chamadas.length = 0
})

const brl = (valor: string) => new RegExp(`R\\$\\s${valor.replace(/\./g, '\\.')}`)

const par = (previsto: string, realizado: string) => ({ previsto, realizado })

function categoria(sobre: Partial<CategoriaRelatorio> & Pick<CategoriaRelatorio, 'nome' | 'valor' | 'porcentagem'>): CategoriaRelatorio {
  return {
    categoria_id: 1,
    icone: 'tag',
    cor: '#112233',
    valor_direto: sobre.valor,
    subcategorias: [],
    ...sobre,
  }
}

const CATEGORIAS: RelatorioCategorias = {
  mes: '2026-10',
  total: '3000.00',
  categorias: [
    categoria({
      categoria_id: 10,
      nome: 'Moradia',
      valor: '2000.00',
      valor_direto: '500.00',
      porcentagem: '66.67',
      subcategorias: [
        { categoria_id: 11, nome: 'Aluguel', icone: 'home', cor: '#112233', valor: '1200.00', valor_direto: '1200.00', porcentagem: '40.00' },
        { categoria_id: 12, nome: 'Condomínio', icone: 'home', cor: '#112233', valor: '300.00', valor_direto: '300.00', porcentagem: '10.00' },
      ],
    }),
    categoria({ categoria_id: 20, nome: 'Lazer', cor: '#445566', valor: '1000.00', porcentagem: '33.33' }),
  ],
}

const DONOS: RelatorioDono = {
  mes: '2026-10',
  total: '3000.00',
  itens: [
    { dono_usuario_id: null, nome: 'Casal', valor: '2800.00', porcentagem: '93.33' },
    { dono_usuario_id: 1, nome: 'Ana', valor: '200.00', porcentagem: '6.67' },
    { dono_usuario_id: 2, nome: 'Bruno', valor: '0.00', porcentagem: '0.00' },
  ],
}

const CONTAS: RelatorioConta = {
  mes: '2026-10',
  total: '3000.00',
  itens: [
    { conta_id: 1, nome: 'Conta Ana', valor: '200.00', porcentagem: '6.67' },
    { conta_id: 2, nome: 'Conta Conjunta', valor: '2800.00', porcentagem: '93.33' },
  ],
}

const MESES = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']

function mesBalanco(mes: string, sobre: Partial<MesBalancoRelatorio> = {}): MesBalancoRelatorio {
  return {
    mes,
    entradas: par('0.00', '0.00'),
    saidas: par('0.00', '0.00'),
    saldo: par('0.00', '0.00'),
    ...sobre,
  }
}

const BALANCO: RelatorioBalancoMensal = {
  meses: MESES.map((mes, i) =>
    i === 5
      ? mesBalanco(mes, {
          entradas: par('10000.00', '6000.00'),
          saidas: par('3000.00', '1700.00'),
          saldo: par('7000.00', '4300.00'),
        })
      : mesBalanco(mes),
  ),
}

const pessoa = (id: number, nome: string, porcentagem: string, devido: string, aportado: string): ProporcaoSaida['pessoas'][number] => ({
  usuario_id: id,
  nome,
  porcentagem,
  devido,
  aportado,
  faltante: '0.00',
  excedente: '0.00',
})

function proporcaoDoMes(mes: string, sobre: Partial<ProporcaoSaida> = {}): ProporcaoSaida {
  return {
    mes,
    base_despesas_casal: '1000.00',
    origem_porcentagem: 'mes',
    mes_origem: null,
    pessoas: [pessoa(1, 'Ana', '60.00', '600.00', '600.00'), pessoa(2, 'Bruno', '40.00', '400.00', '400.00')],
    ...sobre,
  }
}

const PROPORCAO: RelatorioProporcaoSaida = {
  meses: MESES.map((mes, i) => {
    if (i === 3) {
      return proporcaoDoMes(mes, {
        origem_porcentagem: 'herdada',
        mes_origem: '2026-07',
        base_despesas_casal: '0.00',
      })
    }
    if (i === 0) {
      return proporcaoDoMes(mes, {
        origem_porcentagem: 'padrao_50_50',
        pessoas: [pessoa(1, 'Ana', '50.00', '500.00', '100.00'), pessoa(2, 'Bruno', '50.00', '500.00', '500.00')],
      })
    }
    return proporcaoDoMes(mes)
  }),
}

function montar(rotas: Parameters<typeof simularApi>[0] = {}) {
  simularResizeObserver()
  return simularApi({
    'GET /api/relatorios/despesas-por-categoria': json(CATEGORIAS),
    'GET /api/relatorios/despesas-por-dono': json(DONOS),
    'GET /api/relatorios/despesas-por-conta': json(CONTAS),
    'GET /api/relatorios/balanco-mensal': json(BALANCO),
    'GET /api/relatorios/proporcao': json(PROPORCAO),
    ...rotas,
  })
}

describe('Relatórios: menu', () => {
  it('lista os cinco relatórios, cada um ligado a /controle/relatorios/<tipo> no mês corrente', async () => {
    montar()
    renderizarApp('/controle/relatorios')

    await screen.findByRole('heading', { level: 1, name: 'Relatórios' })
    const opcoes: [string, string][] = [
      ['Despesas por categoria', 'categorias'],
      ['Despesas por dono', 'donos'],
      ['Despesas por conta', 'contas'],
      ['Balanço mensal', 'balanco'],
      ['Proporção e aporte', 'proporcao'],
    ]
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Despesas por categoria' })).toHaveAttribute(
        'href',
        '/controle/relatorios/categorias?mes=2026-10',
      ),
    )
    for (const [rotulo, tipo] of opcoes) {
      expect(screen.getByRole('link', { name: rotulo })).toHaveAttribute('href', `/controle/relatorios/${tipo}?mes=2026-10`)
    }
  })

  it('o link "Controle" volta ao Controle no mesmo mês', async () => {
    montar()
    renderizarApp('/controle/relatorios?mes=2026-08')
    await screen.findByRole('heading', { level: 1, name: 'Relatórios' })
    // A barra inferior também tem um link "Controle"; o de volta da tela leva o mês.
    const links = screen.getAllByRole('link', { name: 'Controle' })
    expect(links.map((l) => l.getAttribute('href'))).toContain('/controle?mes=2026-08')
  })

  it('tocar numa opção abre o relatório', async () => {
    montar()
    const { user } = renderizarApp('/controle/relatorios')
    await user.click(await screen.findByRole('link', { name: 'Despesas por dono' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Despesas por dono' })).toBeInTheDocument()
  })
})

describe('Relatórios: rota por :tipo (CA-0.01)', () => {
  it.each([
    ['categorias', 'Despesas por categoria'],
    ['donos', 'Despesas por dono'],
    ['contas', 'Despesas por conta'],
    ['balanco', 'Balanço mensal'],
    ['proporcao', 'Proporção e aporte'],
  ])('/controle/relatorios/%s abre "%s" sem erro', async (tipo, titulo) => {
    montar()
    renderizarApp(`/controle/relatorios/${tipo}`)
    expect(await screen.findByRole('heading', { level: 1, name: titulo })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Carregando…')).not.toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('/controle/relatorios/xyz mostra "Relatório não encontrado." com volta para Relatórios', async () => {
    const api = montar()
    renderizarApp('/controle/relatorios/xyz?mes=2026-09')
    expect(await screen.findByText('Relatório não encontrado.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Relatórios' })).toHaveAttribute('href', '/controle/relatorios?mes=2026-09')
    expect(api.chamadas.filter((c) => c.caminho.startsWith('/api/relatorios'))).toHaveLength(0)
  })
})

describe('Relatório de despesas por categoria (CA-5.26)', () => {
  it('consulta o mês corrente e mostra total, categorias com valor e porcentagem de 2 casas', async () => {
    const api = montar()
    renderizarApp('/controle/relatorios/categorias')

    const moradia = (await screen.findByText('Moradia', { selector: 'span' })).closest('li') as HTMLElement
    expect(api.chamadasDe('GET /api/relatorios/despesas-por-categoria')[0]?.params).toEqual({ mes: '2026-10' })
    expect(screen.getByText(/^Total/)).toHaveTextContent(brl('3.000,00'))
    expect(moradia).toHaveTextContent(brl('2.000,00'))
    expect(moradia).toHaveTextContent('66,67%')
    const lazer = screen.getByText('Lazer').closest('li') as HTMLElement
    expect(lazer).toHaveTextContent(brl('1.000,00'))
    expect(lazer).toHaveTextContent('33,33%')
    expect(screen.getByRole('img', { name: 'Distribuição por categoria' })).toBeInTheDocument()
  })

  it('a soma dos valores das categorias mostradas é igual ao total', async () => {
    montar()
    renderizarApp('/controle/relatorios/categorias')
    const moradia = (await screen.findByText('Moradia', { selector: 'span' })).closest('ul') as HTMLElement
    const emCentavos = (texto: string) => Number(texto.replace(/[^\d-]/g, ''))
    const soma = within(moradia)
      .getAllByRole('listitem')
      .map((li) => emCentavos(/-?R\$\s[\d.]+,\d{2}/.exec(li.textContent ?? '')?.[0] ?? '0'))
      .reduce((a, b) => a + b, 0)
    const total = emCentavos(/R\$\s[\d.]+,\d{2}/.exec(screen.getByText(/^Total/).textContent ?? '')?.[0] ?? '0')
    expect(soma).toBe(300000)
    expect(soma).toBe(total)
  })

  it('lista categoria > subcategorias com valor e porcentagem', async () => {
    montar()
    renderizarApp('/controle/relatorios/categorias')

    const secao = (await screen.findByRole('heading', { level: 2, name: 'Subcategorias' })).closest('section') as HTMLElement
    expect(within(secao).getByRole('heading', { level: 3, name: 'Moradia' })).toBeInTheDocument()
    const aluguel = within(secao).getByText('Aluguel').closest('li') as HTMLElement
    expect(aluguel).toHaveTextContent(brl('1.200,00'))
    expect(aluguel).toHaveTextContent('40,00%')
    const condominio = within(secao).getByText('Condomínio').closest('li') as HTMLElement
    expect(condominio).toHaveTextContent(brl('300,00'))
    expect(condominio).toHaveTextContent('10,00%')
    // Lazer não tem subcategorias: não aparece como grupo.
    expect(within(secao).queryByRole('heading', { level: 3, name: 'Lazer' })).not.toBeInTheDocument()
  })

  it('a rosca desenha uma fatia por categoria', async () => {
    montar()
    renderizarApp('/controle/relatorios/categorias')
    await screen.findByText('Moradia', { selector: 'span' })
    expect(nomesDasFatias()).toEqual(['Moradia', 'Lazer'])
  })

  it('ajuste de fatura negativo fica na lista e não vira fatia da rosca (S2 da t193)', async () => {
    montar({
      'GET /api/relatorios/despesas-por-categoria': json({
        mes: '2026-10',
        total: '950.00',
        categorias: [
          categoria({ categoria_id: 10, nome: 'Moradia', valor: '1000.00', porcentagem: '105.26' }),
          categoria({ categoria_id: null, nome: 'Reajuste de fatura', icone: null, cor: null, valor: '-50.00', porcentagem: '-5.26' }),
        ],
      } satisfies RelatorioCategorias),
    })
    renderizarApp('/controle/relatorios/categorias')

    const ajuste = (await screen.findByText('Reajuste de fatura')).closest('li') as HTMLElement
    expect(ajuste).toHaveTextContent('-R$ 50,00')
    expect(ajuste).toHaveTextContent('-5,26%')
    expect(nomesDasFatias()).toEqual(['Moradia'])
  })

  it('mês sem despesas mostra a frase de estado vazio e nenhum gráfico', async () => {
    montar({
      'GET /api/relatorios/despesas-por-categoria': json({ mes: '2026-10', total: '0.00', categorias: [] }),
    })
    renderizarApp('/controle/relatorios/categorias')
    expect(await screen.findByText('Sem despesas neste mês.')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Distribuição por categoria' })).not.toBeInTheDocument()
  })

  it('trocar o mês no seletor reconsulta o relatório do novo mês', async () => {
    const api = montar()
    const { user } = renderizarApp('/controle/relatorios/categorias')
    await screen.findByText('Moradia', { selector: 'span' })

    await user.click(screen.getByRole('button', { name: 'mês anterior' }))

    await waitFor(() =>
      expect(api.chamadasDe('GET /api/relatorios/despesas-por-categoria').at(-1)?.params).toEqual({ mes: '2026-09' }),
    )
    expect(await screen.findByText('setembro de 2026')).toBeInTheDocument()
  })

  it('mostra a mensagem do servidor quando a consulta falha', async () => {
    montar({ 'GET /api/relatorios/despesas-por-categoria': erroApi(403, 'PROIBIDO', 'Sem acesso ao relatório.') })
    renderizarApp('/controle/relatorios/categorias')
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem acesso ao relatório.')
  })
})

describe('Relatórios por dono e por conta (CA-5.27)', () => {
  it('por dono: casal R$ 2.800,00 = 93,33%, Ana 6,67% e Bruno 0,00%, total R$ 3.000,00', async () => {
    const api = montar()
    renderizarApp('/controle/relatorios/donos')

    const casal = (await screen.findByText('Casal')).closest('li') as HTMLElement
    expect(api.chamadasDe('GET /api/relatorios/despesas-por-dono')[0]?.params).toEqual({ mes: '2026-10' })
    expect(casal).toHaveTextContent(brl('2.800,00'))
    expect(casal).toHaveTextContent('93,33%')
    const ana = screen.getByText('Ana').closest('li') as HTMLElement
    expect(ana).toHaveTextContent(brl('200,00'))
    expect(ana).toHaveTextContent('6,67%')
    const bruno = screen.getByText('Bruno').closest('li') as HTMLElement
    expect(bruno).toHaveTextContent(brl('0,00'))
    expect(bruno).toHaveTextContent('0,00%')
    expect(screen.getByText(/^Total/)).toHaveTextContent(brl('3.000,00'))
    expect(screen.getByRole('img', { name: 'Distribuição por dono' })).toBeInTheDocument()
  })

  it('por dono: a rosca desenha só as fatias de valor positivo (Bruno com R$ 0,00 fica só na lista)', async () => {
    montar()
    renderizarApp('/controle/relatorios/donos')
    await screen.findByText('Casal')
    expect(nomesDasFatias()).toEqual(['Casal', 'Ana'])
  })

  it('por conta: valor e porcentagem de cada conta e total', async () => {
    const api = montar()
    renderizarApp('/controle/relatorios/contas')

    const conjunta = (await screen.findByText('Conta Conjunta')).closest('li') as HTMLElement
    expect(api.chamadasDe('GET /api/relatorios/despesas-por-conta')[0]?.params).toEqual({ mes: '2026-10' })
    expect(conjunta).toHaveTextContent(brl('2.800,00'))
    expect(conjunta).toHaveTextContent('93,33%')
    const ana = screen.getByText('Conta Ana').closest('li') as HTMLElement
    expect(ana).toHaveTextContent(brl('200,00'))
    expect(ana).toHaveTextContent('6,67%')
    expect(screen.getByText(/^Total/)).toHaveTextContent(brl('3.000,00'))
    expect(screen.getByRole('img', { name: 'Distribuição por conta' })).toBeInTheDocument()
  })

  it('por dono e por conta: mês sem saídas mostra o estado vazio', async () => {
    montar({
      'GET /api/relatorios/despesas-por-dono': json({ mes: '2026-10', total: '0.00', itens: [] }),
      'GET /api/relatorios/despesas-por-conta': json({ mes: '2026-10', total: '0.00', itens: [] }),
    })
    const primeiro = renderizarApp('/controle/relatorios/donos')
    expect(await screen.findByText('Sem despesas neste mês.')).toBeInTheDocument()
    primeiro.unmount()
    renderizarApp('/controle/relatorios/contas')
    expect(await screen.findByText('Sem despesas neste mês.')).toBeInTheDocument()
  })
})

describe('Relatório de balanço mensal (CA-5.28)', () => {
  it('consulta o mês e mostra 6 meses com entradas, saídas e saldo (previsto e realizado)', async () => {
    const api = montar()
    renderizarApp('/controle/relatorios/balanco')

    const outubro = (await screen.findByRole('heading', { level: 2, name: 'outubro de 2026' })).closest('section') as HTMLElement
    expect(api.chamadasDe('GET /api/relatorios/balanco-mensal')[0]?.params).toEqual({ mes: '2026-10' })
    const meses = ['maio de 2026', 'junho de 2026', 'julho de 2026', 'agosto de 2026', 'setembro de 2026', 'outubro de 2026']
    for (const nome of meses) {
      expect(screen.getByRole('heading', { level: 2, name: nome })).toBeInTheDocument()
    }
    const linha = (rotulo: string) => within(outubro).getByText(rotulo).closest('div') as HTMLElement
    expect(linha('Entradas')).toHaveTextContent('+R$ 10.000,00')
    expect(linha('Entradas')).toHaveTextContent('+R$ 6.000,00')
    expect(linha('Saídas')).toHaveTextContent('-R$ 3.000,00')
    expect(linha('Saídas')).toHaveTextContent('-R$ 1.700,00')
    expect(linha('Saldo do mês')).toHaveTextContent(brl('7.000,00'))
    expect(linha('Saldo do mês')).toHaveTextContent(brl('4.300,00'))
  })

  it('mês sem lançamentos aparece com zeros', async () => {
    montar()
    renderizarApp('/controle/relatorios/balanco')

    const maio = (await screen.findByRole('heading', { level: 2, name: 'maio de 2026' })).closest('section') as HTMLElement
    const entradas = within(maio).getByText('Entradas').closest('div') as HTMLElement
    expect(entradas).toHaveTextContent('R$ 0,00')
    expect(within(maio).getByText('Saídas').closest('div')).toHaveTextContent('R$ 0,00')
    expect(within(maio).getByText('Saldo do mês').closest('div')).toHaveTextContent('R$ 0,00')
  })

  it('o gráfico de barras tem texto alternativo, legenda em texto e uma barra de entrada e de saída por mês', async () => {
    montar()
    const { container } = renderizarApp('/controle/relatorios/balanco')

    const grafico = await screen.findByRole('img', { name: 'Entradas e saídas por mês' })
    const legenda = grafico.parentElement?.querySelector('ul') as HTMLElement
    expect(within(legenda).getByText('Entradas')).toBeInTheDocument()
    expect(within(legenda).getByText('Saídas')).toBeInTheDocument()
    await waitFor(() => expect(container.querySelectorAll('.recharts-bar').length).toBe(2))
    await waitFor(() => expect(container.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick').length).toBe(6))
  })

  it('trocar o mês reconsulta o balanço do novo mês', async () => {
    const api = montar()
    const { user } = renderizarApp('/controle/relatorios/balanco')
    await screen.findByRole('heading', { level: 2, name: 'outubro de 2026' })

    await user.click(screen.getByRole('button', { name: 'mês anterior' }))

    await waitFor(() => expect(api.chamadasDe('GET /api/relatorios/balanco-mensal').at(-1)?.params).toEqual({ mes: '2026-09' }))
  })
})

describe('Relatório de proporção e aporte (CA-5.29)', () => {
  it('mostra os 6 meses, cada um com porcentagem, devido e aportado de A e de B', async () => {
    const api = montar()
    renderizarApp('/controle/relatorios/proporcao')

    const junho = (await screen.findByRole('heading', { level: 2, name: 'junho de 2026' })).closest('section') as HTMLElement
    expect(api.chamadasDe('GET /api/relatorios/proporcao')[0]?.params).toEqual({ mes: '2026-10' })
    for (const nome of ['maio de 2026', 'julho de 2026', 'agosto de 2026', 'setembro de 2026', 'outubro de 2026']) {
      expect(screen.getByRole('heading', { level: 2, name: nome })).toBeInTheDocument()
    }
    const ana = within(junho).getByRole('heading', { name: 'Ana' }).closest('section') as HTMLElement
    expect(ana).toHaveTextContent('60,00%')
    expect(ana).toHaveTextContent('Devido')
    expect(ana).toHaveTextContent(brl('600,00'))
    expect(ana).toHaveTextContent('Aportado')
    expect(within(junho).getByRole('heading', { name: 'Bruno' }).closest('section')).toHaveTextContent('40,00%')
  })

  it('mês sem Salário mostra a porcentagem herdada, com o mês de origem', async () => {
    montar()
    renderizarApp('/controle/relatorios/proporcao')
    const agosto = (await screen.findByRole('heading', { level: 2, name: 'agosto de 2026' })).closest('section') as HTMLElement
    expect(within(agosto).getByText('Porcentagem herdada de julho de 2026')).toBeInTheDocument()
  })

  it('mês sem Salário em nenhum mês anterior mostra 50% para cada', async () => {
    montar()
    renderizarApp('/controle/relatorios/proporcao')
    const maio = (await screen.findByRole('heading', { level: 2, name: 'maio de 2026' })).closest('section') as HTMLElement
    expect(within(maio).getByText('50% para cada, por falta de Salário no histórico')).toBeInTheDocument()
    const ana = within(maio).getByRole('heading', { name: 'Ana' }).closest('section') as HTMLElement
    expect(ana).toHaveTextContent('50,00%')
    expect(ana).toHaveTextContent(brl('500,00'))
    expect(ana).toHaveTextContent(brl('100,00'))
  })

  it('sem vínculo de casal mostra o estado vazio com ação para o vínculo', async () => {
    montar({ 'GET /api/relatorios/proporcao': erroApi(409, 'SEM_VINCULO', 'Sem vínculo.') })
    const { user } = renderizarApp('/controle/relatorios/proporcao')

    expect(await screen.findByText('Você ainda não está vinculado a um casal.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ir para o vínculo' }))
    await waitFor(() => expect(screen.queryByText('Você ainda não está vinculado a um casal.')).not.toBeInTheDocument())
  })

  it('outro erro do servidor mostra a mensagem', async () => {
    montar({ 'GET /api/relatorios/proporcao': erroApi(403, 'PROIBIDO', 'Sem acesso ao relatório.') })
    renderizarApp('/controle/relatorios/proporcao')
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem acesso ao relatório.')
  })
})
