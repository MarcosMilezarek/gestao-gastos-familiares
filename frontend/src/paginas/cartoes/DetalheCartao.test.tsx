import { afterEach, describe, expect, it } from 'vitest'
import { configure, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { CartaoSaida } from '../../api/cartoes'
import { erroApi, json, limparTudo, renderizarApp, semConteudo, simularApi } from '../../testes/utilitarios'

// Primeira renderização de cada arquivo é lenta com os workers em paralelo.
configure({ asyncUtilTimeout: 5000 })

afterEach(async () => {
  limparTudo()
  await new Promise((r) => setTimeout(r, 10))
})

function cartao(sobre: Partial<CartaoSaida> = {}): CartaoSaida {
  return {
    id: 1,
    nome: 'Nubank',
    conta_id: 1,
    dono_usuario_id: null,
    limite: '5000.00',
    dia_fechamento: 10,
    dia_vencimento: 17,
    bandeira: 'Mastercard',
    conta_arquivada: false,
    limite_usado: '0.00',
    limite_disponivel: '5000.00',
    uso_porcentagem: '0.00',
    fatura_corrente: {
      cartao_id: 1,
      cartao_nome: 'Nubank',
      conta_id: 1,
      mes: '2026-10',
      id: null,
      status: 'aberta',
      fechamento: '2026-10-10',
      vencimento: '2026-10-17',
      valor: '0.00',
      pagamento: null,
    },
    ...sobre,
  }
}

const CONTA = {
  id: 1,
  nome: 'Conta Conjunta',
  instituicao: null,
  tipo: 'conta_corrente',
  cor: '#336699',
  saldo_inicial: '0.00',
  dono_usuario_id: null,
  arquivado: false,
  casal_encerrado: false,
  saldo_atual: '0.00',
  saldo_previsto: '0.00',
}

function montar(sobre: Partial<CartaoSaida> = {}, extra: Parameters<typeof simularApi>[0] = {}) {
  return simularApi({
    'GET /api/cartoes/1': json(cartao(sobre)),
    'GET /api/contas/1': json(CONTA),
    'GET /api/cartoes': json({ cartoes: [], limite_disponivel_total: null, total_faturas_mes: null }),
    ...extra,
  })
}

describe('detalhe e edição do cartão (CA-4.01)', () => {
  it('mostra os dados atuais, a conta dona só leitura e o link da fatura atual', async () => {
    montar()
    renderizarApp('/cartoes/1')

    expect(await screen.findByRole('heading', { name: 'Nubank' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toHaveValue('Nubank')
    expect(screen.getByLabelText('Limite')).toHaveValue('5.000,00')
    expect(screen.getByLabelText('Dia de fechamento')).toHaveValue('10')
    expect(screen.getByLabelText('Dia de vencimento')).toHaveValue('17')
    expect(screen.getByLabelText('Bandeira (opcional)')).toHaveValue('Mastercard')
    expect(await screen.findByText('Conta Conjunta')).toBeInTheDocument()
    expect(screen.queryByLabelText('Conta dona')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver fatura atual' })).toHaveAttribute(
      'href',
      '/cartoes/1/faturas/2026-10',
    )
  })

  it('editar o limite envia PATCH com os campos e mostra "Cartão salvo."', async () => {
    const api = montar({}, { 'PATCH /api/cartoes/1': json(cartao({ limite: '8000.00' })) })
    const { user } = renderizarApp('/cartoes/1')
    await screen.findByRole('heading', { name: 'Nubank' })

    const limite = screen.getByLabelText('Limite')
    await user.clear(limite)
    await user.type(limite, '800000')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Cartão salvo.')
    expect(api.chamadasDe('PATCH /api/cartoes/1')[0]?.corpo).toEqual({
      nome: 'Nubank',
      limite: '8000.00',
      dia_fechamento: 10,
      dia_vencimento: 17,
      bandeira: 'Mastercard',
    })
  })

  it('bandeira apagada vai como null', async () => {
    const api = montar({}, { 'PATCH /api/cartoes/1': json(cartao()) })
    const { user } = renderizarApp('/cartoes/1')
    await screen.findByRole('heading', { name: 'Nubank' })

    await user.clear(screen.getByLabelText('Bandeira (opcional)'))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(api.chamadasDe('PATCH /api/cartoes/1')).toHaveLength(1))
    expect(api.chamadasDe('PATCH /api/cartoes/1')[0]?.corpo).toMatchObject({ bandeira: null })
  })

  it('campo obrigatório apagado impede o envio e mostra o erro', async () => {
    const api = montar()
    const { user } = renderizarApp('/cartoes/1')
    await screen.findByRole('heading', { name: 'Nubank' })

    await user.clear(screen.getByLabelText('Dia de vencimento'))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(screen.getByText('Informe o dia de vencimento.')).toBeInTheDocument()
    expect(api.chamadasDe('PATCH /api/cartoes/1')).toHaveLength(0)
  })

  it('erro do servidor no PATCH aparece no campo e como aviso', async () => {
    montar(
      {},
      {
        'PATCH /api/cartoes/1': erroApi(422, 'VALIDACAO', 'Dados inválidos.', {
          dia_vencimento: 'O dia deve estar entre 1 e 31.',
        }),
      },
    )
    const { user } = renderizarApp('/cartoes/1')
    await screen.findByRole('heading', { name: 'Nubank' })
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText('O dia deve estar entre 1 e 31.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Dados inválidos.')
  })

  it('mostra o aviso sobre o efeito de mudar os dias nas faturas', async () => {
    montar()
    renderizarApp('/cartoes/1')
    await screen.findByRole('heading', { name: 'Nubank' })
    expect(screen.getAllByText(/os itens já lançados não são movidos de fatura/)).toHaveLength(2)
  })

  it('conta dona arquivada deixa o cartão só para consulta, sem Salvar nem Excluir', async () => {
    montar({ conta_arquivada: true })
    renderizarApp('/cartoes/1')

    expect(
      await screen.findByText('A conta dona está arquivada: o cartão está só para consulta.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Excluir cartão' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver fatura atual' })).toBeInTheDocument()
  })

  it('excluir pede confirmação; cancelar não chama o servidor', async () => {
    const api = montar()
    const { user } = renderizarApp('/cartoes/1')
    await screen.findByRole('heading', { name: 'Nubank' })

    await user.click(screen.getByRole('button', { name: 'Excluir cartão' }))
    expect(await screen.findByRole('dialog', { name: 'Excluir cartão' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.chamadasDe('DELETE /api/cartoes/1')).toHaveLength(0)
  })

  it('confirmar a exclusão chama DELETE e volta à lista', async () => {
    const api = montar({}, { 'DELETE /api/cartoes/1': semConteudo() })
    const { user } = renderizarApp('/cartoes/1')
    await screen.findByRole('heading', { name: 'Nubank' })

    await user.click(screen.getByRole('button', { name: 'Excluir cartão' }))
    await user.click(await screen.findByRole('button', { name: 'Excluir' }))

    expect(await screen.findByRole('heading', { name: 'Cartões' })).toBeInTheDocument()
    expect(api.chamadasDe('DELETE /api/cartoes/1')).toHaveLength(1)
  })

  it('exclusão recusada pelo servidor fecha o diálogo e mostra o erro', async () => {
    montar(
      {},
      { 'DELETE /api/cartoes/1': erroApi(409, 'CARTAO_COM_MOVIMENTO', 'O cartão tem compras e não pode ser excluído.') },
    )
    const { user } = renderizarApp('/cartoes/1')
    await screen.findByRole('heading', { name: 'Nubank' })

    await user.click(screen.getByRole('button', { name: 'Excluir cartão' }))
    await user.click(await screen.findByRole('button', { name: 'Excluir' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('O cartão tem compras e não pode ser excluído.')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Nubank' })).toBeInTheDocument()
  })

  it('cartão inexistente mostra a mensagem do servidor', async () => {
    simularApi({ 'GET /api/cartoes/99': erroApi(404, 'NAO_ENCONTRADO', 'Cartão não encontrado.') })
    renderizarApp('/cartoes/99')
    expect(await screen.findByRole('alert')).toHaveTextContent('Cartão não encontrado.')
  })

  it('id não numérico mostra "Cartão não encontrado." sem chamar a API', async () => {
    const api = simularApi({})
    renderizarApp('/cartoes/abc')
    expect(await screen.findByRole('alert')).toHaveTextContent('Cartão não encontrado.')
    expect(api.chamadasDe('GET /api/cartoes/NaN')).toHaveLength(0)
  })
})
