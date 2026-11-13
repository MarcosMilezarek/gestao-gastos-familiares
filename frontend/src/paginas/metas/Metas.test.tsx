import { afterEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { MetaSaida, MetasSaida } from '../../api/metas'
import { erroApi, json, limparTudo, renderizarApp, simularApi } from '../../testes/utilitarios'

// O BottomSheet chama history.back() ao desmontar (popstate assíncrono): espera assentar.
afterEach(async () => {
  limparTudo()
  await new Promise((r) => setTimeout(r, 20))
})

function meta(parcial: Partial<MetaSaida> & { id: number; nome: string }): MetaSaida {
  return {
    valor_alvo: '10000.00',
    data_alvo: null,
    valor_inicial: '0.00',
    cor: '#00838F',
    icone: 'plane',
    descricao: null,
    valor_atual: '1600.00',
    aplicado_liquido: '1600.00',
    rendeu: '0.00',
    falta: '8400.00',
    porcentagem: '16.00',
    situacao: 'em_andamento',
    casal_encerrado: false,
    ...parcial,
  }
}

const EM_ANDAMENTO = meta({ id: 1, nome: 'Viagem', data_alvo: '2027-06-30' })
const CONCLUIDA = meta({
  id: 2,
  nome: 'Casamento',
  valor_alvo: '4500.00',
  valor_atual: '5000.00',
  falta: '0.00',
  porcentagem: '111.11',
  situacao: 'concluida',
})
const ACIMA = meta({
  id: 3,
  nome: 'Reserva',
  valor_alvo: '1000.00',
  valor_atual: '1100.00',
  falta: '0.00',
  porcentagem: '110.00',
  situacao: 'concluida',
})

function lista(metas: MetaSaida[], patrimonio = '6600.00'): MetasSaida {
  return { patrimonio_total: patrimonio, metas }
}

describe('Metas: lista e patrimônio (CA-6.09, CA-6.10)', () => {
  it('mostra o patrimônio total vindo do servidor e os cards da aba Em andamento', async () => {
    simularApi({ 'GET /api/metas': json(lista([EM_ANDAMENTO, CONCLUIDA])) })
    renderizarApp('/metas')
    expect(await screen.findByText('Viagem')).toBeInTheDocument()
    expect(screen.getByText('Patrimônio total').parentElement).toHaveTextContent('R$ 6.600,00')
    expect(screen.queryByText('Casamento')).not.toBeInTheDocument()
    const card = screen.getByRole('link', { name: /Viagem/ })
    expect(card).toHaveAttribute('href', '/metas/1')
    expect(card).toHaveTextContent('R$ 1.600,00')
    expect(card).toHaveTextContent('R$ 10.000,00')
    expect(card).toHaveTextContent('R$ 8.400,00')
    expect(card).toHaveTextContent('16,00%')
    expect(card).toHaveTextContent('30/06/2027')
  })

  it('o patrimônio mostrado é o do servidor, sem soma no cliente (6.600 -> 6.700 após recarregar)', async () => {
    let total = '6600.00'
    simularApi({ 'GET /api/metas': () => json(lista([EM_ANDAMENTO, CONCLUIDA], total)) })
    const { cliente } = renderizarApp('/metas')
    await screen.findByText('Viagem')
    expect(screen.getByText('Patrimônio total').parentElement).toHaveTextContent('R$ 6.600,00')
    total = '6700.00'
    await cliente.invalidateQueries({ queryKey: ['metas'] })
    expect(await screen.findByText('R$ 6.700,00')).toBeInTheDocument()
  })

  it('a aba Concluídas mostra só as concluídas e a aba marcada fica pressionada', async () => {
    simularApi({ 'GET /api/metas': json(lista([EM_ANDAMENTO, CONCLUIDA])) })
    const { user } = renderizarApp('/metas')
    await screen.findByText('Viagem')
    expect(screen.getByRole('button', { name: 'Em andamento' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Concluídas' }))
    expect(screen.getByRole('button', { name: 'Concluídas' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Casamento')).toBeInTheDocument()
    expect(screen.queryByText('Viagem')).not.toBeInTheDocument()
  })

  it('meta acima do alvo (110,00 %) fica em Concluídas com falta R$ 0,00', async () => {
    simularApi({ 'GET /api/metas': json(lista([EM_ANDAMENTO, ACIMA])) })
    const { user } = renderizarApp('/metas')
    await screen.findByText('Viagem')
    expect(screen.queryByText('Reserva')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Concluídas' }))
    const card = screen.getByRole('link', { name: /Reserva/ })
    expect(card).toHaveTextContent('110,00%')
    expect(within(card).getByText('Falta').nextSibling).toHaveTextContent('R$ 0,00')
  })

  it('aba sem metas mostra a frase da aba', async () => {
    simularApi({ 'GET /api/metas': json(lista([EM_ANDAMENTO])) })
    const { user } = renderizarApp('/metas')
    await screen.findByText('Viagem')
    await user.click(screen.getByRole('button', { name: 'Concluídas' }))
    expect(screen.getByText('Nenhuma meta concluída ainda.')).toBeInTheDocument()
  })

  it('só com concluídas, a aba Em andamento mostra a frase própria', async () => {
    simularApi({ 'GET /api/metas': json(lista([CONCLUIDA], '5000.00')) })
    renderizarApp('/metas')
    expect(await screen.findByText('Nenhuma meta em andamento.')).toBeInTheDocument()
  })
})

describe('Metas: estado vazio e criação (CA-6.09, CA-0.07)', () => {
  it('sem metas mostra o estado vazio com botão Criar meta que abre o formulário', async () => {
    simularApi({ 'GET /api/metas': json(lista([], '0.00')) })
    const { user } = renderizarApp('/metas')
    expect(await screen.findByText(/Nenhuma meta cadastrada/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Em andamento' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Criar meta' }))
    expect(await screen.findByRole('dialog', { name: 'Nova meta' })).toBeInTheDocument()
  })

  it('o botão Nova meta do topo abre o formulário de criação', async () => {
    simularApi({ 'GET /api/metas': json(lista([EM_ANDAMENTO])) })
    const { user } = renderizarApp('/metas')
    await screen.findByText('Viagem')
    await user.click(screen.getByRole('button', { name: 'Nova meta' }))
    expect(await screen.findByRole('dialog', { name: 'Nova meta' })).toBeInTheDocument()
  })

  it('criar meta recarrega a lista e fecha o formulário', async () => {
    let metas = [EM_ANDAMENTO]
    const api = simularApi({
      'GET /api/metas': () => json(lista(metas)),
      'POST /api/metas': () => {
        metas = [...metas, meta({ id: 9, nome: 'Reforma' })]
        return json(metas[1], 201)
      },
    })
    const { user } = renderizarApp('/metas')
    await screen.findByText('Viagem')
    await user.click(screen.getByRole('button', { name: 'Nova meta' }))
    await user.type(await screen.findByLabelText('Nome'), 'Reforma')
    await user.type(screen.getByLabelText('Valor-alvo'), '500000')
    await user.click(screen.getByRole('button', { name: 'cor azul' }))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Reforma')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.chamadasDe('POST /api/metas')).toHaveLength(1)
  })
})

describe('Metas: erro de carga', () => {
  it('mostra a mensagem do servidor em alerta quando a lista falha', async () => {
    simularApi({ 'GET /api/metas': erroApi(403, 'SEM_VINCULO', 'Você não tem um casal vinculado.') })
    renderizarApp('/metas')
    expect(await screen.findByRole('alert')).toHaveTextContent('Você não tem um casal vinculado.')
  })
})
