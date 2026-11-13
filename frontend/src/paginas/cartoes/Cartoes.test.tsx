import { afterEach, describe, expect, it } from 'vitest'
import { configure, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { CartaoSaida, FaturaResumo, ListaCartoes } from '../../api/cartoes'
import { erroApi, json, limparTudo, renderizarApp, simularApi } from '../../testes/utilitarios'

// Primeira renderização de cada arquivo é lenta com os workers em paralelo.
configure({ asyncUtilTimeout: 5000 })

afterEach(async () => {
  limparTudo()
  await new Promise((r) => setTimeout(r, 10))
})

function fatura(sobre: Partial<FaturaResumo> = {}): FaturaResumo {
  return {
    cartao_id: 1,
    cartao_nome: 'Nubank',
    conta_id: 1,
    mes: '2026-10',
    id: 7,
    status: 'aberta',
    fechamento: '2026-10-10',
    vencimento: '2026-10-17',
    valor: '800.00',
    pagamento: null,
    ...sobre,
  }
}

function cartao(sobre: Partial<CartaoSaida> = {}): CartaoSaida {
  return {
    id: 1,
    nome: 'Nubank',
    conta_id: 1,
    dono_usuario_id: null,
    limite: '5000.00',
    dia_fechamento: 10,
    dia_vencimento: 17,
    bandeira: null,
    conta_arquivada: false,
    limite_usado: '800.00',
    limite_disponivel: '4200.00',
    uso_porcentagem: '16.00',
    fatura_corrente: fatura(),
    ...sobre,
  }
}

function lista(cartoes: CartaoSaida[], totais: Partial<ListaCartoes> = {}): ListaCartoes {
  return {
    cartoes,
    limite_disponivel_total: cartoes.length ? '4200.00' : null,
    total_faturas_mes: cartoes.length ? '800.00' : null,
    ...totais,
  }
}

describe('lista de cartões (CA-4.06)', () => {
  it('mostra nome, status, valor e vencimento da fatura, uso do limite, disponível e Pagar fatura', async () => {
    simularApi({ 'GET /api/cartoes': json(lista([cartao()])) })
    renderizarApp('/cartoes')

    const card = (await screen.findByRole('heading', { name: 'Nubank' })).closest('article')!
    expect(within(card).getByText('Aberta')).toBeInTheDocument()
    expect(within(card).getByText('Valor da fatura').nextElementSibling).toHaveTextContent('R$ 800,00')
    expect(within(card).getByText('Vencimento').nextElementSibling).toHaveTextContent('17/10/2026')
    expect(within(card).getByText('Disponível').nextElementSibling).toHaveTextContent('R$ 4.200,00')
    expect(card).toHaveTextContent('R$ 800,00 usado de R$ 5.000,00 · 16,00%')
    expect(within(card).getByRole('link', { name: 'Pagar fatura' })).toHaveAttribute(
      'href',
      '/cartoes/1/faturas/2026-10?pagar=1',
    )
  })

  it('o resumo mostra o limite disponível total e o total das faturas do mês', async () => {
    simularApi({
      'GET /api/cartoes': json(
        lista([cartao()], { limite_disponivel_total: '9000.00', total_faturas_mes: '1234.50' }),
      ),
    })
    renderizarApp('/cartoes')

    await screen.findByRole('heading', { name: 'Nubank' })
    expect(screen.getByText('Limite disponível').parentElement).toHaveTextContent('R$ 9.000,00')
    expect(screen.getByText('Faturas do mês').parentElement).toHaveTextContent('R$ 1.234,50')
  })

  it('o nome do cartão leva à fatura do mês corrente', async () => {
    simularApi({
      'GET /api/cartoes': json(lista([cartao()])),
    })
    renderizarApp('/cartoes')
    expect(await screen.findByRole('link', { name: 'Nubank' })).toHaveAttribute(
      'href',
      '/cartoes/1/faturas/2026-10',
    )
    expect(screen.getByRole('link', { name: 'Editar cartão' })).toHaveAttribute('href', '/cartoes/1')
  })

  it('sem cartões mostra o estado vazio e o botão leva ao cadastro', async () => {
    simularApi({
      'GET /api/cartoes': json(lista([])),
      'GET /api/contas': json({ mes: '2026-10', contas: [], total_saldo_atual: null, total_saldo_previsto: null }),
    })
    const { user } = renderizarApp('/cartoes')

    expect(await screen.findByText('Nenhum cartão cadastrado.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cadastrar cartão' }))
    expect(await screen.findByRole('heading', { name: 'Novo cartão' })).toBeInTheDocument()
  })

  it.each([
    ['fatura paga', { status: 'paga' as const }],
    ['fatura zerada', { status: 'zerada' as const, valor: '0.00' }],
    ['fatura com valor zero', { valor: '0.00' }],
    [
      'fatura com pagamento previsto',
      { pagamento: { lancamento_id: 9, data: '2026-10-20', situacao: 'prevista' as const, valor: '800.00' } },
    ],
  ])('não oferece Pagar fatura com %s', async (_nome, sobre) => {
    simularApi({ 'GET /api/cartoes': json(lista([cartao({ fatura_corrente: fatura(sobre) })])) })
    renderizarApp('/cartoes')

    await screen.findByRole('heading', { name: 'Nubank' })
    expect(screen.queryByRole('link', { name: 'Pagar fatura' })).not.toBeInTheDocument()
  })

  it('não oferece Pagar fatura quando a conta dona está arquivada', async () => {
    simularApi({ 'GET /api/cartoes': json(lista([cartao({ conta_arquivada: true })])) })
    renderizarApp('/cartoes')

    await screen.findByRole('heading', { name: 'Nubank' })
    expect(screen.queryByRole('link', { name: 'Pagar fatura' })).not.toBeInTheDocument()
  })

  it('mostra o status vencida com texto, além da cor', async () => {
    simularApi({
      'GET /api/cartoes': json(lista([cartao({ fatura_corrente: fatura({ status: 'vencida' }) })])),
    })
    renderizarApp('/cartoes')
    expect(await screen.findByText('Vencida')).toBeInTheDocument()
  })

  it('Pagar fatura do card abre o sheet de pagamento uma única vez', async () => {
    simularApi({
      'GET /api/cartoes': json(lista([cartao()])),
      'GET /api/contas': json({ mes: '2026-10', contas: [], total_saldo_atual: null, total_saldo_previsto: null }),
      'GET /api/cartoes/1/faturas/2026-10': json({
        ...fatura(),
        bruto: '800.00',
        credito_recebido: '0.00',
        credito_repassado: '0.00',
        itens: [],
        conta_arquivada: false,
        pode_pagar: true,
        editavel: true,
      }),
    })
    const { user } = renderizarApp('/cartoes')
    await user.click(await screen.findByRole('link', { name: 'Pagar fatura' }))

    expect(await screen.findByRole('dialog', { name: 'Pagar fatura' })).toBeInTheDocument()
  })

  it('cartões de contas arquivadas só são buscados ao abrir a seção', async () => {
    const api = simularApi({
      'GET /api/cartoes': ({ params }) =>
        params.arquivadas === 'true'
          ? json(lista([cartao({ id: 2, nome: 'Cartão Antigo', conta_arquivada: true })]))
          : json(lista([cartao()])),
    })
    const { user } = renderizarApp('/cartoes')
    await screen.findByRole('heading', { name: 'Nubank' })
    expect(api.chamadasDe('GET /api/cartoes').map((c) => c.params.arquivadas)).toEqual(['false'])

    const botao = screen.getByRole('button', { name: /Contas arquivadas/ })
    expect(botao).toHaveAttribute('aria-expanded', 'false')
    await user.click(botao)

    expect(await screen.findByRole('heading', { name: 'Cartão Antigo' })).toBeInTheDocument()
    expect(botao).toHaveAttribute('aria-expanded', 'true')
    expect(api.chamadasDe('GET /api/cartoes').map((c) => c.params.arquivadas)).toEqual(['false', 'true'])
  })

  it('seção de arquivadas sem cartões mostra a frase de vazio', async () => {
    simularApi({
      'GET /api/cartoes': ({ params }) =>
        params.arquivadas === 'true' ? json(lista([])) : json(lista([cartao()])),
    })
    const { user } = renderizarApp('/cartoes')
    await screen.findByRole('heading', { name: 'Nubank' })
    await user.click(screen.getByRole('button', { name: /Contas arquivadas/ }))
    expect(await screen.findByText('Nenhum cartão em contas arquivadas.')).toBeInTheDocument()
  })

  it('mostra a mensagem do servidor quando a lista falha', async () => {
    simularApi({ 'GET /api/cartoes': erroApi(403, 'SEM_PERMISSAO', 'Sem permissão para ver cartões.') })
    renderizarApp('/cartoes')
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem permissão para ver cartões.')
  })
})
