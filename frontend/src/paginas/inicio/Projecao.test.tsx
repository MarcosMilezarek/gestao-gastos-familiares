import { cloneElement, type ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { ProjecaoMes, ProjecaoSaida } from '../../api/projecao'
import {
  erroApi,
  json,
  limparTudo,
  renderizarApp,
  simularApi,
  simularResizeObserver,
} from '../../testes/utilitarios'

// O ResponsiveContainer do recharts mede o elemento (0 x 0 no jsdom) e não desenha nada.
// Aqui ele só repassa um tamanho fixo ao gráfico, para o rótulo dos meses aparecer no eixo.
vi.mock('recharts', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('recharts')>()
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 400, height: 300 }),
  }
})

afterEach(limparTudo)

const brl = (valor: string) => new RegExp(`R\\$\\s${valor.replace(/\./g, '\\.')}`)

const CONTAS = [
  { id: 1, nome: 'Conta Ana', dono_usuario_id: 1 },
  { id: 2, nome: 'Conta Conjunta', dono_usuario_id: null },
].map((c) => ({
  instituicao: null,
  tipo: 'conta_corrente',
  cor: '#336699',
  saldo_inicial: '0.00',
  arquivado: false,
  casal_encerrado: false,
  saldo_atual: '0.00',
  saldo_previsto: '0.00',
  ...c,
}))

const LISTA_CONTAS = json({ mes: '2026-10', contas: CONTAS, total_saldo_atual: null, total_saldo_previsto: null })

const NOMES = ['outubro de 2026', 'novembro de 2026', 'dezembro de 2026', 'janeiro de 2027', 'fevereiro de 2027', 'março de 2027']
const ISOS = ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']

function mes(iso: string, indice: number, sobre: Partial<ProjecaoMes> = {}): ProjecaoMes {
  return {
    mes: iso,
    previsto: indice > 0,
    entradas: '0.00',
    saidas: '0.00',
    transferencias_entrada: '0.00',
    transferencias_saida: '0.00',
    pagamentos_fatura: '0.00',
    aplicacoes_menos_resgates: '0.00',
    saldo_previsto: '0.00',
    ...sobre,
  }
}

function projecao(horizonte: number, contaId: number | null = null, base = '1000.00'): ProjecaoSaida {
  return {
    conta_id: contaId,
    horizonte,
    meses: Array.from({ length: horizonte }, (_, i) => {
      const iso = i < 6 ? ISOS[i]! : `2027-${String(i - 2).padStart(2, '0')}`
      return mes(iso, i, { saldo_previsto: i === 0 ? base : `${i}00.00` })
    }),
  }
}

function montar(extras: Parameters<typeof simularApi>[0] = {}) {
  simularResizeObserver()
  return simularApi({
    'GET /api/contas': LISTA_CONTAS,
    'GET /api/projecao': ({ params }) =>
      json(projecao(Number(params.horizonte ?? 6), params.conta_id ? Number(params.conta_id) : null)),
    ...extras,
  })
}

describe('Projeção: seletores (CA-5.22)', () => {
  it('oferece "Todas" e as contas ativas no seletor de conta', async () => {
    montar()
    renderizarApp('/projecao')

    const seletor = await screen.findByLabelText('Conta')
    await waitFor(() => expect(within(seletor).getAllByRole('option')).toHaveLength(3))
    expect(within(seletor).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Todas',
      'Conta Ana',
      'Conta Conjunta',
    ])
    expect(seletor).toHaveDisplayValue('Todas')
  })

  it('o seletor de conta não oferece conta arquivada: só as que a API devolve entram (CA-5.25)', async () => {
    const api = montar()
    renderizarApp('/projecao')
    const seletor = await screen.findByLabelText('Conta')
    await waitFor(() => expect(within(seletor).getAllByRole('option')).toHaveLength(3))
    // A listagem pedida é a de ativas: sem o filtro de arquivadas.
    expect(api.chamadasDe('GET /api/contas')[0]?.params.arquivadas).toBeUndefined()
  })

  it('oferece os horizontes de 3, 6 e 12 meses com padrão 6', async () => {
    montar()
    renderizarApp('/projecao')

    const seletor = await screen.findByLabelText('Horizonte')
    expect(within(seletor).getAllByRole('option').map((o) => o.textContent)).toEqual([
      '3 meses',
      '6 meses',
      '12 meses',
    ])
    expect(seletor).toHaveDisplayValue('6 meses')
  })

  it('consulta a projeção de todas as contas com horizonte 6 ao abrir', async () => {
    const api = montar()
    renderizarApp('/projecao')

    await screen.findByRole('table')
    expect(api.chamadasDe('GET /api/projecao')[0]?.params).toEqual({ horizonte: '6' })
  })

  it('trocar o horizonte para 12 reconsulta e mostra 12 linhas', async () => {
    const api = montar()
    const { user } = renderizarApp('/projecao')
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(7))

    await user.selectOptions(screen.getByLabelText('Horizonte'), '12')

    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(13))
    expect(api.chamadasDe('GET /api/projecao').at(-1)?.params).toEqual({ horizonte: '12' })
  })

  it('trocar o horizonte para 3 mostra 3 linhas', async () => {
    montar()
    const { user } = renderizarApp('/projecao')
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(7))

    await user.selectOptions(screen.getByLabelText('Horizonte'), '3')

    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(4))
  })

  it('escolher uma conta reconsulta com conta_id e voltar para "Todas" remove o parâmetro', async () => {
    const api = montar()
    const { user } = renderizarApp('/projecao')
    const seletor = await screen.findByLabelText('Conta')
    await waitFor(() => expect(within(seletor).getAllByRole('option')).toHaveLength(3))

    await user.selectOptions(seletor, 'Conta Conjunta')
    await waitFor(() => expect(api.chamadasDe('GET /api/projecao').at(-1)?.params).toEqual({ horizonte: '6', conta_id: '2' }))

    await user.selectOptions(seletor, 'Todas')
    await waitFor(() => expect(api.chamadasDe('GET /api/projecao').at(-1)?.params).toEqual({ horizonte: '6' }))
  })
})

describe('Projeção: gráfico e tabela (CA-5.22, CA-5.25)', () => {
  it('mostra uma linha por mês do horizonte a partir do mês corrente, com os valores em R$', async () => {
    montar({
      'GET /api/projecao': json({
        conta_id: null,
        horizonte: 3,
        meses: [
          mes('2026-10', 0, { entradas: '5000.00', saidas: '3000.00', saldo_previsto: '7050.00' }),
          mes('2026-11', 1, {
            transferencias_entrada: '200.00',
            transferencias_saida: '100.00',
            pagamentos_fatura: '800.00',
            aplicacoes_menos_resgates: '-50.00',
            saldo_previsto: '-100.00',
          }),
          mes('2026-12', 2, { saldo_previsto: '-600.00' }),
        ],
      } satisfies ProjecaoSaida),
    })
    renderizarApp('/projecao')

    const tabela = await screen.findByRole('table')
    const linhas = within(tabela).getAllByRole('row').slice(1)
    expect(linhas).toHaveLength(3)
    expect(linhas[0]).toHaveTextContent('outubro de 2026')
    expect(linhas[0]).toHaveTextContent('+R$ 5.000,00')
    expect(linhas[0]).toHaveTextContent('-R$ 3.000,00')
    expect(linhas[0]).toHaveTextContent(brl('7.050,00'))
    expect(linhas[1]).toHaveTextContent('novembro de 2026')
    expect(linhas[1]).toHaveTextContent('+R$ 200,00')
    expect(linhas[1]).toHaveTextContent('-R$ 100,00')
    expect(linhas[1]).toHaveTextContent('-R$ 800,00')
    expect(linhas[1]).toHaveTextContent('-R$ 50,00')
    expect(within(linhas[1]!).getAllByText('-R$ 100,00').length).toBeGreaterThanOrEqual(2)
    expect(linhas[2]).toHaveTextContent('dezembro de 2026')
    expect(linhas[2]).toHaveTextContent('-R$ 600,00')
    expect(within(tabela).getAllByRole('columnheader').map((c) => c.textContent)).toContain('Saldo previsto')
  })

  it('só os meses depois do corrente levam a marca "Previsto"', async () => {
    montar()
    renderizarApp('/projecao')

    const tabela = await screen.findByRole('table')
    const linhas = within(tabela).getAllByRole('row').slice(1)
    expect(linhas).toHaveLength(6)
    expect(within(linhas[0]!).queryByText('Previsto')).not.toBeInTheDocument()
    for (const linha of linhas.slice(1)) {
      expect(within(linha).getByText('Previsto')).toBeInTheDocument()
    }
    expect(linhas.map((l) => within(l).getByRole('rowheader').textContent?.replace('Previsto', ''))).toEqual(NOMES)
  })

  it('o gráfico tem texto alternativo e um ponto de eixo por mês', async () => {
    montar()
    const { container } = renderizarApp('/projecao')

    expect(await screen.findByRole('img', { name: 'Saldo previsto por mês' })).toBeInTheDocument()
    await waitFor(() => expect(container.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick').length).toBe(6))
  })

  it('o saldo do mês corrente na tabela é o recebido da API (cenário-base R$ 7.050,00)', async () => {
    montar({ 'GET /api/projecao': json(projecao(6, null, '7050.00')) })
    renderizarApp('/projecao')
    const tabela = await screen.findByRole('table')
    const primeira = within(tabela).getAllByRole('row')[1]!
    expect(primeira).toHaveTextContent('outubro de 2026')
    expect(primeira).toHaveTextContent(brl('7.050,00'))
  })

  it('mantém gráfico e tabela enquanto a nova projeção carrega', async () => {
    let liberar: () => void = () => {}
    const espera = new Promise<void>((resolve) => {
      liberar = resolve
    })
    montar({
      'GET /api/projecao': async ({ params }) => {
        if (params.horizonte === '3') await espera
        return json(projecao(Number(params.horizonte)))
      },
    })
    const { user } = renderizarApp('/projecao')
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(7))

    await user.selectOptions(screen.getByLabelText('Horizonte'), '3')

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.queryByText('Carregando…')).not.toBeInTheDocument()
    liberar()
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(4))
  })
})

describe('Projeção: navegação e erro', () => {
  it('mostra o título, o link de volta ao Início e a mensagem de erro do servidor', async () => {
    montar({ 'GET /api/projecao': erroApi(403, 'PROIBIDO', 'Sem permissão para a projeção.') })
    renderizarApp('/projecao')

    expect(await screen.findByRole('heading', { level: 1, name: 'Projeção de saldo' })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem permissão para a projeção.')
    // A barra inferior também tem um link "Início"; o link de volta da tela é o que está no conteúdo.
    expect(screen.getAllByRole('link', { name: 'Início' }).every((l) => l.getAttribute('href') === '/')).toBe(true)
  })
})
