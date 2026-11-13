import { afterEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { MetaSaida } from '../../api/metas'
import { erroApi, json, limparTudo, renderizarApp, simularApi } from '../../testes/utilitarios'

afterEach(limparTudo)

const META: MetaSaida = {
  id: 3,
  nome: 'Viagem',
  valor_alvo: '10000.00',
  data_alvo: '2026-12-20',
  valor_inicial: '0.00',
  cor: '#336699',
  icone: 'plane',
  descricao: null,
  valor_atual: '1000.00',
  aplicado_liquido: '1000.00',
  rendeu: '0.00',
  falta: '9000.00',
  porcentagem: '10.00',
  situacao: 'em_andamento',
  casal_encerrado: false,
}

const SEM_METAS = json({ metas: [] })

async function preencher(user: ReturnType<typeof renderizarApp>['user'], alvo: string, atual: string | null, mes: string) {
  await user.type(screen.getByLabelText('Valor-alvo'), alvo)
  if (atual !== null) {
    const campo = screen.getByLabelText('Valor atual')
    await user.clear(campo)
    await user.type(campo, atual)
  }
  if (mes !== '') await user.type(screen.getByLabelText('Mês-alvo'), mes)
}

describe('PlanoMetas: cálculo (CA-7.13)', () => {
  it('alvo 12.000, atual 0, 09/2027: mostra 12 meses, R$ 1.000,00 por mês e total R$ 12.000,00', async () => {
    const api = simularApi({
      'GET /api/metas': SEM_METAS,
      'GET /api/plano-de-metas/calculo': json({
        meses: 12,
        aplicacao_mensal: '1000.00',
        total_a_aplicar: '12000.00',
        atingida: false,
      }),
    })
    const { user } = renderizarApp('/planejamento/plano-de-metas')
    await screen.findByRole('heading', { name: 'Plano de metas' })
    await preencher(user, '1200000', null, '2027-09')
    await user.click(screen.getByRole('button', { name: 'Calcular' }))
    const resultado = (await screen.findByRole('heading', { name: 'Resultado' })).closest('section')!
    expect(within(resultado).getByText('12')).toBeInTheDocument()
    expect(within(resultado).getByText('R$ 1.000,00')).toBeInTheDocument()
    expect(within(resultado).getByText('R$ 12.000,00')).toBeInTheDocument()
    expect(api.chamadasDe('GET /api/plano-de-metas/calculo')[0]!.params).toEqual({
      valor_alvo: '12000.00',
      valor_atual: '0.00',
      mes_alvo: '2027-09',
    })
  })

  it('mostra o arredondamento do servidor (R$ 333,34)', async () => {
    simularApi({
      'GET /api/metas': SEM_METAS,
      'GET /api/plano-de-metas/calculo': json({
        meses: 3,
        aplicacao_mensal: '333.34',
        total_a_aplicar: '1000.00',
        atingida: false,
      }),
    })
    const { user } = renderizarApp('/planejamento/plano-de-metas')
    await screen.findByRole('heading', { name: 'Plano de metas' })
    await preencher(user, '100000', null, '2026-12')
    await user.click(screen.getByRole('button', { name: 'Calcular' }))
    expect(await screen.findByText('R$ 333,34')).toBeInTheDocument()
  })

  it('meta já atingida mostra o aviso e nenhuma aplicação mensal', async () => {
    simularApi({
      'GET /api/metas': SEM_METAS,
      'GET /api/plano-de-metas/calculo': json({
        meses: 0,
        aplicacao_mensal: '0.00',
        total_a_aplicar: '0.00',
        atingida: true,
      }),
    })
    const { user } = renderizarApp('/planejamento/plano-de-metas')
    await screen.findByRole('heading', { name: 'Plano de metas' })
    await preencher(user, '100000', '100000', '2026-12')
    await user.click(screen.getByRole('button', { name: 'Calcular' }))
    expect(await screen.findByText('Meta já atingida.')).toBeInTheDocument()
    expect(screen.queryByText('Aplicação mensal')).toBeNull()
  })

  it('mês-alvo passado recusado pelo servidor aparece junto ao campo, sem resultado', async () => {
    simularApi({
      'GET /api/metas': SEM_METAS,
      'GET /api/plano-de-metas/calculo': erroApi(422, 'VALIDACAO', 'Dados inválidos.', {
        mes_alvo: 'O mês-alvo deve ser posterior ao mês atual.',
      }),
    })
    const { user } = renderizarApp('/planejamento/plano-de-metas')
    await screen.findByRole('heading', { name: 'Plano de metas' })
    await preencher(user, '100000', null, '2026-09')
    await user.click(screen.getByRole('button', { name: 'Calcular' }))
    expect((await screen.findAllByText('O mês-alvo deve ser posterior ao mês atual.')).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Mês-alvo')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('heading', { name: 'Resultado' })).toBeNull()
  })

  it('valor-alvo zero e mês-alvo vazio são recusados na tela, sem chamar a API', async () => {
    const api = simularApi({ 'GET /api/metas': SEM_METAS })
    const { user } = renderizarApp('/planejamento/plano-de-metas')
    await screen.findByRole('heading', { name: 'Plano de metas' })
    await user.click(screen.getByRole('button', { name: 'Calcular' }))
    expect(await screen.findByText('Informe um valor-alvo maior que zero.')).toBeInTheDocument()
    expect(screen.getByText('Informe o mês-alvo.')).toBeInTheDocument()
    expect(screen.getByLabelText('Valor-alvo')).toHaveFocus()
    expect(api.chamadasDe('GET /api/plano-de-metas/calculo')).toHaveLength(0)
  })

  it('alterar um campo depois do cálculo esconde o resultado antigo', async () => {
    simularApi({
      'GET /api/metas': SEM_METAS,
      'GET /api/plano-de-metas/calculo': json({
        meses: 3,
        aplicacao_mensal: '333.34',
        total_a_aplicar: '1000.00',
        atingida: false,
      }),
    })
    const { user } = renderizarApp('/planejamento/plano-de-metas')
    await screen.findByRole('heading', { name: 'Plano de metas' })
    await preencher(user, '100000', null, '2026-12')
    await user.click(screen.getByRole('button', { name: 'Calcular' }))
    await screen.findByRole('heading', { name: 'Resultado' })
    await user.type(screen.getByLabelText('Valor atual'), '1')
    expect(screen.queryByRole('heading', { name: 'Resultado' })).toBeNull()
  })
})

describe('PlanoMetas: partir de uma meta (CA-7.13)', () => {
  it('escolher a meta preenche alvo, atual e mês; alterar e calcular não altera a meta nem cria aplicação', async () => {
    const api = simularApi({
      'GET /api/metas': json({ metas: [META] }),
      'GET /api/plano-de-metas/calculo': json({
        meses: 3,
        aplicacao_mensal: '3000.00',
        total_a_aplicar: '9000.00',
        atingida: false,
      }),
    })
    const { user } = renderizarApp('/planejamento/plano-de-metas')
    await user.selectOptions(await screen.findByLabelText('Meta (opcional)'), 'Viagem')
    expect(screen.getByLabelText('Valor-alvo')).toHaveValue('10.000,00')
    expect(screen.getByLabelText('Valor atual')).toHaveValue('1.000,00')
    expect(screen.getByLabelText('Mês-alvo')).toHaveValue('2026-12')
    const alvo = screen.getByLabelText('Valor-alvo')
    await user.clear(alvo)
    await user.type(alvo, '2000000')
    await user.click(screen.getByRole('button', { name: 'Calcular' }))
    expect(await screen.findByText('R$ 3.000,00')).toBeInTheDocument()
    expect(api.chamadasDe('GET /api/plano-de-metas/calculo')[0]!.params.valor_alvo).toBe('20000.00')
    const escritas = api.chamadas.filter((c) => c.metodo !== 'GET')
    expect(escritas).toHaveLength(0)
  })

  it('meta sem data deixa o mês-alvo vazio', async () => {
    simularApi({ 'GET /api/metas': json({ metas: [{ ...META, data_alvo: null }] }) })
    const { user } = renderizarApp('/planejamento/plano-de-metas')
    await user.selectOptions(await screen.findByLabelText('Meta (opcional)'), 'Viagem')
    expect(screen.getByLabelText('Mês-alvo')).toHaveValue('')
  })

  it('sem metas cadastradas não mostra o seletor de meta', async () => {
    simularApi({ 'GET /api/metas': SEM_METAS })
    renderizarApp('/planejamento/plano-de-metas')
    await screen.findByRole('heading', { name: 'Plano de metas' })
    await screen.findByLabelText('Valor-alvo')
    expect(screen.queryByLabelText('Meta (opcional)')).toBeNull()
  })

  it('avisa que o plano não é salvo e reabrir a tela começa vazia', async () => {
    simularApi({
      'GET /api/metas': SEM_METAS,
      'GET /api/plano-de-metas/calculo': json({
        meses: 3,
        aplicacao_mensal: '333.34',
        total_a_aplicar: '1000.00',
        atingida: false,
      }),
    })
    const { user, unmount } = renderizarApp('/planejamento/plano-de-metas')
    expect(await screen.findByText('Este plano não é salvo: é só um cálculo.')).toBeInTheDocument()
    await preencher(user, '100000', null, '2026-12')
    await user.click(screen.getByRole('button', { name: 'Calcular' }))
    await screen.findByRole('heading', { name: 'Resultado' })
    unmount()
    renderizarApp('/planejamento/plano-de-metas')
    await screen.findByRole('heading', { name: 'Plano de metas' })
    expect(screen.getByLabelText('Valor-alvo')).toHaveValue('')
    expect(screen.getByLabelText('Mês-alvo')).toHaveValue('')
    expect(screen.queryByRole('heading', { name: 'Resultado' })).toBeNull()
  })
})
