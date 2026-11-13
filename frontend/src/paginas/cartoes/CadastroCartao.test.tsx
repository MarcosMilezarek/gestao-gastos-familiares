import { afterEach, describe, expect, it } from 'vitest'
import { configure, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { ContaSaida } from '../../api/contas'
import { erroApi, json, limparTudo, renderizarApp, simularApi } from '../../testes/utilitarios'

// Primeira renderização de cada arquivo é lenta com os workers em paralelo.
configure({ asyncUtilTimeout: 5000 })

afterEach(async () => {
  limparTudo()
  await new Promise((r) => setTimeout(r, 10))
})

const conta = (id: number, nome: string): ContaSaida => ({
  id,
  nome,
  instituicao: null,
  tipo: 'conta_corrente',
  cor: '#336699',
  saldo_inicial: '0.00',
  dono_usuario_id: null,
  arquivado: false,
  casal_encerrado: false,
  saldo_atual: '0.00',
  saldo_previsto: '0.00',
})

const listaContas = (contas: ContaSaida[]) =>
  json({ mes: '2026-10', contas, total_saldo_atual: null, total_saldo_previsto: null })

const CARTAO_CRIADO = { id: 5 }

function montar(extra: Parameters<typeof simularApi>[0] = {}) {
  return simularApi({
    'GET /api/contas': listaContas([conta(1, 'Conta Conjunta')]),
    'GET /api/cartoes': json({ cartoes: [], limite_disponivel_total: null, total_faturas_mes: null }),
    'POST /api/cartoes': json(CARTAO_CRIADO, 201),
    ...extra,
  })
}

async function abrir() {
  const retorno = renderizarApp('/cartoes/novo')
  await screen.findByRole('heading', { name: 'Novo cartão' })
  await waitFor(() => expect(screen.getByRole('option', { name: 'Conta Conjunta' })).toBeInTheDocument())
  return retorno
}

async function preencher(
  user: Awaited<ReturnType<typeof abrir>>['user'],
  v: { nome?: string; limite?: string; fechamento?: string; vencimento?: string; bandeira?: string } = {},
) {
  await user.selectOptions(screen.getByLabelText('Conta dona'), 'Conta Conjunta')
  if (v.nome) await user.type(screen.getByLabelText('Nome'), v.nome)
  if (v.limite) await user.type(screen.getByLabelText('Limite'), v.limite)
  if (v.fechamento) await user.type(screen.getByLabelText('Dia de fechamento'), v.fechamento)
  if (v.vencimento) await user.type(screen.getByLabelText('Dia de vencimento'), v.vencimento)
  if (v.bandeira) await user.type(screen.getByLabelText('Bandeira (opcional)'), v.bandeira)
}

describe('cadastro de cartão (CA-4.01)', () => {
  it('salva nome, conta dona, limite 5.000,00, fechamento 10 e vencimento 17 sem bandeira e volta à lista', async () => {
    const api = montar()
    const { user } = await abrir()
    await preencher(user, { nome: 'Nubank', limite: '500000', fechamento: '10', vencimento: '17' })

    expect(screen.getByLabelText('Limite')).toHaveValue('5.000,00')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByRole('heading', { name: 'Cartões' })).toBeInTheDocument()
    const post = api.chamadasDe('POST /api/cartoes')
    expect(post).toHaveLength(1)
    expect(post[0]?.corpo).toEqual({
      nome: 'Nubank',
      conta_id: 1,
      limite: '5000.00',
      dia_fechamento: 10,
      dia_vencimento: 17,
    })
  })

  it('a bandeira é opcional e, quando informada, vai no corpo', async () => {
    const api = montar()
    const { user } = await abrir()
    await preencher(user, {
      nome: 'Visa',
      limite: '100000',
      fechamento: '5',
      vencimento: '12',
      bandeira: 'Visa',
    })
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(api.chamadasDe('POST /api/cartoes')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/cartoes')[0]?.corpo).toMatchObject({ bandeira: 'Visa' })
  })

  it('formulário vazio mostra os erros dos campos obrigatórios, não envia e foca o primeiro inválido', async () => {
    const api = montar()
    const { user } = await abrir()

    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(screen.getByText('Escolha a conta dona do cartão.')).toBeInTheDocument()
    expect(screen.getByText('Informe o nome do cartão.')).toBeInTheDocument()
    expect(screen.getByText('Informe o limite.')).toBeInTheDocument()
    expect(screen.getByText('Informe o dia de fechamento.')).toBeInTheDocument()
    expect(screen.getByText('Informe o dia de vencimento.')).toBeInTheDocument()
    expect(api.chamadasDe('POST /api/cartoes')).toHaveLength(0)
    await waitFor(() => expect(screen.getByLabelText('Conta dona')).toHaveFocus())
  })

  it('com a conta escolhida, o foco vai para o primeiro campo inválido seguinte (Nome)', async () => {
    montar()
    const { user } = await abrir()
    await user.selectOptions(screen.getByLabelText('Conta dona'), 'Conta Conjunta')

    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveFocus())
    expect(screen.getByLabelText('Nome')).toHaveAttribute('aria-invalid', 'true')
  })

  it('nome só com espaços é tratado como vazio', async () => {
    const api = montar()
    const { user } = await abrir()
    await preencher(user, { limite: '100000', fechamento: '10', vencimento: '17' })
    await user.type(screen.getByLabelText('Nome'), '   ')

    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(screen.getByText('Informe o nome do cartão.')).toBeInTheDocument()
    expect(api.chamadasDe('POST /api/cartoes')).toHaveLength(0)
  })

  it('os dias aceitam só dígitos, no máximo 2', async () => {
    montar()
    const { user } = await abrir()
    await user.type(screen.getByLabelText('Dia de fechamento'), '1a2b3')
    expect(screen.getByLabelText('Dia de fechamento')).toHaveValue('12')
  })

  it('dia 32 é recusado pelo servidor e a mensagem aparece no campo', async () => {
    montar({
      'POST /api/cartoes': erroApi(422, 'VALIDACAO', 'Dados inválidos.', {
        dia_fechamento: 'O dia deve estar entre 1 e 31.',
      }),
    })
    const { user } = await abrir()
    await preencher(user, { nome: 'X', limite: '100000', fechamento: '32', vencimento: '17' })
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText('O dia deve estar entre 1 e 31.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Dados inválidos.')
    await waitFor(() => expect(screen.getByLabelText('Dia de fechamento')).toHaveFocus())
    expect(screen.getByRole('heading', { name: 'Novo cartão' })).toBeInTheDocument()
  })

  it('limite 0 recusado pelo servidor aparece no campo Limite', async () => {
    montar({
      'POST /api/cartoes': erroApi(422, 'VALIDACAO', 'Dados inválidos.', {
        limite: 'O limite deve ser maior que zero.',
      }),
    })
    const { user } = await abrir()
    await preencher(user, { nome: 'X', limite: '0', fechamento: '10', vencimento: '17' })
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText('O limite deve ser maior que zero.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Limite')).toHaveFocus())
  })

  it('erro sem campos aparece como aviso geral', async () => {
    montar({ 'POST /api/cartoes': erroApi(409, 'CONFLITO', 'Já existe um cartão com esse nome.') })
    const { user } = await abrir()
    await preencher(user, { nome: 'X', limite: '100000', fechamento: '10', vencimento: '17' })
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe um cartão com esse nome.')
  })

  it('sem contas ativas avisa e desabilita a escolha da conta dona', async () => {
    montar({ 'GET /api/contas': listaContas([]) })
    renderizarApp('/cartoes/novo')

    expect(await screen.findByText(/Cadastre uma conta antes de criar o cartão/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir para Contas' })).toHaveAttribute('href', '/controle/contas')
    expect(screen.getByLabelText('Conta dona')).toBeDisabled()
  })

  it('o link Cartões volta à lista', async () => {
    montar()
    const { user } = await abrir()
    await user.click(within(screen.getByRole('main')).getByRole('link', { name: 'Cartões' }))
    expect(await screen.findByRole('heading', { name: 'Cartões' })).toBeInTheDocument()
  })
})
