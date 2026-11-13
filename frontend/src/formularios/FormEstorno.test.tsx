import { afterEach, describe, expect, it } from 'vitest'
import { configure, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { FaturaResumo, FaturaSaida, ItemFaturaSaida } from '../api/cartoes'
import { erroApi, json, limparTudo, renderizarApp, simularApi } from '../testes/utilitarios'

// O BottomSheet chama history.back() ao desmontar (popstate assíncrono): espera antes de limpar.
// Primeira renderização de cada arquivo é lenta com os workers em paralelo.
configure({ asyncUtilTimeout: 5000 })

afterEach(async () => {
  limparTudo()
  await new Promise((r) => setTimeout(r, 10))
})

function resumo(mes: string, status: FaturaResumo['status'] = 'aberta'): FaturaResumo {
  return {
    cartao_id: 1,
    cartao_nome: 'Nubank',
    conta_id: 1,
    mes,
    id: 7,
    status,
    fechamento: `${mes}-10`,
    vencimento: `${mes}-17`,
    valor: '0.00',
    pagamento: null,
  }
}

const MERCADO = { id: 10, nome: 'Mercado', pai_nome: null, cor: '#112233', icone: 'tag' }
const LAZER = { id: 11, nome: 'Lazer', pai_nome: null, cor: '#223344', icone: 'tag' }

function item(sobre: Partial<ItemFaturaSaida> = {}): ItemFaturaSaida {
  return {
    id: 100,
    tipo: 'compra',
    valor: '40.00',
    data: '2026-10-05',
    descricao: 'Camisa',
    descricao_base: 'Camisa',
    categoria: LAZER,
    tags: [],
    observacao: null,
    serie: null,
    item_origem_id: null,
    fatura_mes: '2026-10',
    fatura_paga: false,
    criado_por: { id: 1, nome: 'Ana' },
    ...sobre,
  }
}

function fatura(mes: string, itens: ItemFaturaSaida[]): FaturaSaida {
  return {
    ...resumo(mes),
    valor: '800.00',
    bruto: '800.00',
    credito_recebido: '0.00',
    credito_repassado: '0.00',
    itens,
    conta_arquivada: false,
    pode_pagar: true,
    editavel: true,
  }
}

const CATEGORIAS = [MERCADO, LAZER].map((c) => ({
  id: c.id,
  nome: c.nome,
  tipo: 'despesa',
  icone: 'tag',
  cor: c.cor,
  fixa: false,
  arquivado: false,
  categoria_pai_id: null,
  subcategorias: [],
}))

const COMPRA_A = item({ id: 100, descricao: 'Camisa', valor: '40.00', data: '2026-10-05', categoria: LAZER })
const COMPRA_B = item({ id: 101, descricao: 'Feira', valor: '90.00', data: '2026-10-07', categoria: MERCADO })
const ESTORNO = item({
  id: 102,
  tipo: 'estorno',
  descricao: 'Estorno antigo',
  valor: '-20.00',
  categoria: LAZER,
  item_origem_id: 100,
})
const AJUSTE = item({ id: 103, tipo: 'ajuste', descricao: 'Ajuste', valor: '5.00', categoria: null })

function montar(extra: Parameters<typeof simularApi>[0] = {}, itens = [COMPRA_A, COMPRA_B, ESTORNO, AJUSTE]) {
  return simularApi({
    'GET /api/cartoes/1/faturas/2026-10': json(fatura('2026-10', itens)),
    'GET /api/cartoes/1/faturas/2026-11': json(
      fatura('2026-11', [item({ id: 200, descricao: 'Compra de novembro', fatura_mes: '2026-11' })]),
    ),
    'GET /api/cartoes/1/faturas': json({
      sugerida: '2026-10',
      faturas: [resumo('2026-09', 'paga'), resumo('2026-10'), resumo('2026-11')],
    }),
    'GET /api/categorias': json(CATEGORIAS),
    'GET /api/tags': json([]),
    'GET /api/contas': json({ mes: '2026-10', contas: [], total_saldo_atual: null, total_saldo_previsto: null }),
    'GET /api/cartoes': json({ cartoes: [], limite_disponivel_total: null, total_faturas_mes: null }),
    'POST /api/cartoes/1/estornos': json(item({ id: 300, tipo: 'estorno' }), 201),
    ...extra,
  })
}

async function abrirEstorno(rota = '/cartoes/1/faturas/2026-10') {
  const retorno = renderizarApp(rota)
  await screen.findByRole('heading', { name: 'Nubank' })
  await retorno.user.click(screen.getByRole('button', { name: 'Lançar estorno' }))
  const dialogo = await screen.findByRole('dialog', { name: 'Lançar estorno' })
  await waitFor(() => expect(within(dialogo).getByRole('option', { name: 'Mercado' })).toBeInTheDocument())
  return { ...retorno, dialogo }
}

describe('lançar estorno (CA-4.16, lado da tela)', () => {
  it('abre com a fatura da tela como destino e sem vínculo', async () => {
    montar()
    const { dialogo } = await abrirEstorno()

    expect(within(dialogo).getByLabelText('Fatura de destino')).toHaveValue('2026-10')
    expect(within(dialogo).getByLabelText('Compra vinculada')).toHaveValue('')
    expect(within(dialogo).queryByText('Foi paga')).not.toBeInTheDocument()
  })

  it('só oferece como vínculo as compras da fatura exibida (nem estornos, nem ajustes, nem outras faturas)', async () => {
    montar()
    const { dialogo } = await abrirEstorno()

    const opcoes = within(within(dialogo).getByLabelText('Compra vinculada'))
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(opcoes).toEqual(['Sem vínculo', 'Camisa · 05/10/2026', 'Feira · 07/10/2026'])
  })

  it('na fatura de outro mês as compras oferecidas são as daquele mês', async () => {
    montar()
    const { dialogo } = await abrirEstorno('/cartoes/1/faturas/2026-11')

    expect(within(dialogo).getByLabelText('Fatura de destino')).toHaveValue('2026-11')
    const opcoes = within(within(dialogo).getByLabelText('Compra vinculada'))
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(opcoes).toEqual(['Sem vínculo', 'Compra de novembro · 05/10/2026'])
  })

  it('estorno de R$ 50,00 sem vínculo é enviado sem item_origem_id e fecha o sheet', async () => {
    const api = montar()
    const { dialogo, user } = await abrirEstorno()
    await user.type(within(dialogo).getByLabelText('Valor'), '5000')
    await user.type(within(dialogo).getByLabelText('Descrição'), 'Devolução')
    await user.selectOptions(within(dialogo).getByLabelText('Categoria'), 'Mercado')

    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Lançar estorno' })).not.toBeInTheDocument())
    const post = api.chamadasDe('POST /api/cartoes/1/estornos')
    expect(post).toHaveLength(1)
    const corpo = post[0]?.corpo as Record<string, unknown>
    expect(corpo).toMatchObject({
      valor: '50.00',
      descricao: 'Devolução',
      categoria_id: 10,
      fatura_mes: '2026-10',
      data: '2026-10-15',
    })
    expect(corpo).not.toHaveProperty('item_origem_id')
  })

  it('escolher a compra vincula o estorno e preenche a categoria dela', async () => {
    const api = montar()
    const { dialogo, user } = await abrirEstorno()
    await user.type(within(dialogo).getByLabelText('Valor'), '3000')
    await user.type(within(dialogo).getByLabelText('Descrição'), 'Estorno camisa')

    await user.selectOptions(within(dialogo).getByLabelText('Compra vinculada'), 'Camisa · 05/10/2026')

    expect(within(dialogo).getByLabelText('Categoria')).toHaveDisplayValue('Lazer')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(api.chamadasDe('POST /api/cartoes/1/estornos')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/cartoes/1/estornos')[0]?.corpo).toMatchObject({
      item_origem_id: 100,
      categoria_id: 11,
      valor: '30.00',
    })
  })

  it('estorno maior que a compra vinculada recusado pelo servidor aparece no vínculo, com o sheet aberto', async () => {
    montar({
      'POST /api/cartoes/1/estornos': erroApi(422, 'VALIDACAO', 'Dados inválidos.', {
        item_origem_id: 'O estorno excede o valor da compra.',
      }),
    })
    const { dialogo, user } = await abrirEstorno()
    await user.type(within(dialogo).getByLabelText('Valor'), '5000')
    await user.type(within(dialogo).getByLabelText('Descrição'), 'Estorno camisa')
    await user.selectOptions(within(dialogo).getByLabelText('Compra vinculada'), 'Camisa · 05/10/2026')

    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    expect(await within(dialogo).findByText('O estorno excede o valor da compra.')).toBeInTheDocument()
    await waitFor(() => expect(within(dialogo).getByLabelText('Compra vinculada')).toHaveFocus())
    expect(screen.getByRole('dialog', { name: 'Lançar estorno' })).toBeInTheDocument()
  })

  it('fatura de destino paga recusada pelo servidor mostra a mensagem (CA-4.19)', async () => {
    montar({
      'POST /api/cartoes/1/estornos': erroApi(409, 'FATURA_PAGA', 'A fatura já está paga: escolha outra fatura.'),
    })
    const { dialogo, user } = await abrirEstorno()
    await user.type(within(dialogo).getByLabelText('Valor'), '5000')
    await user.type(within(dialogo).getByLabelText('Descrição'), 'Devolução')
    await user.selectOptions(within(dialogo).getByLabelText('Categoria'), 'Mercado')

    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('A fatura já está paga: escolha outra fatura.')
  })

  it('faturas pagas ficam desabilitadas na escolha da fatura de destino (CA-4.19)', async () => {
    montar()
    const { dialogo } = await abrirEstorno()
    expect(within(dialogo).getByRole('option', { name: /setembro de 2026 · Paga/ })).toBeDisabled()
  })
})

describe('foco no primeiro campo inválido (t164)', () => {
  it('formulário vazio mostra "Campo obrigatório." e foca o Valor', async () => {
    const api = montar()
    const { dialogo, user } = await abrirEstorno()

    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    expect(within(dialogo).getAllByText('Campo obrigatório.')).toHaveLength(3)
    expect(api.chamadasDe('POST /api/cartoes/1/estornos')).toHaveLength(0)
    await waitFor(() => expect(within(dialogo).getByLabelText('Valor')).toHaveFocus())
  })

  it('com o valor preenchido o foco vai para a Descrição', async () => {
    montar()
    const { dialogo, user } = await abrirEstorno()
    await user.type(within(dialogo).getByLabelText('Valor'), '5000')

    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(within(dialogo).getByLabelText('Descrição')).toHaveFocus())
  })

  it('com valor e descrição o foco vai para a Categoria', async () => {
    montar()
    const { dialogo, user } = await abrirEstorno()
    await user.type(within(dialogo).getByLabelText('Valor'), '5000')
    await user.type(within(dialogo).getByLabelText('Descrição'), 'Devolução')

    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(within(dialogo).getByLabelText('Categoria')).toHaveFocus())
    expect(within(dialogo).getByLabelText('Categoria')).toHaveAttribute('aria-invalid', 'true')
  })

  it('erro de campo fora da tela vira mensagem geral', async () => {
    montar({ 'POST /api/cartoes/1/estornos': erroApi(422, 'VALIDACAO', 'Cartão inválido.', { cartao_id: 'x' }) })
    const { dialogo, user } = await abrirEstorno()
    await user.type(within(dialogo).getByLabelText('Valor'), '5000')
    await user.type(within(dialogo).getByLabelText('Descrição'), 'Devolução')
    await user.selectOptions(within(dialogo).getByLabelText('Categoria'), 'Mercado')

    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Cartão inválido.')
  })
})

describe('editar estorno', () => {
  async function abrirEdicao(extra: Parameters<typeof simularApi>[0] = {}, estorno = ESTORNO) {
    const api = montar(
      { 'PATCH /api/itens-fatura/102': json(estorno), ...extra },
      [COMPRA_A, COMPRA_B, estorno],
    )
    const retorno = renderizarApp('/cartoes/1/faturas/2026-10')
    await screen.findByRole('heading', { name: 'Nubank' })
    const linha = screen.getByText(estorno.descricao).closest('li')!
    await retorno.user.click(within(linha).getByRole('button', { name: 'Editar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar estorno' })
    return { ...retorno, api, dialogo }
  }

  it('mostra o valor sem sinal e o vínculo travado com explicação', async () => {
    montar()
    const { dialogo } = await abrirEdicao()

    expect(within(dialogo).getByLabelText('Valor')).toHaveValue('20,00')
    expect(within(dialogo).getByLabelText('Descrição')).toHaveValue('Estorno antigo')
    expect(within(dialogo).getByLabelText('Compra vinculada')).toBeDisabled()
    expect(within(dialogo).getByLabelText('Compra vinculada')).toHaveDisplayValue('Camisa · 05/10/2026')
    expect(within(dialogo).getByText('O vínculo não muda na edição.')).toBeInTheDocument()
    expect(within(dialogo).getByLabelText('Fatura de destino')).toHaveValue('2026-10')
  })

  it('salvar envia PATCH no item sem item_origem_id', async () => {
    const { api, dialogo, user } = await abrirEdicao()

    const valor = within(dialogo).getByLabelText('Valor')
    await user.clear(valor)
    await user.type(valor, '2500')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(api.chamadasDe('PATCH /api/itens-fatura/102')).toHaveLength(1))
    const corpo = api.chamadasDe('PATCH /api/itens-fatura/102')[0]?.corpo as Record<string, unknown>
    expect(corpo).toMatchObject({ valor: '25.00', fatura_mes: '2026-10', categoria_id: 11 })
    expect(corpo).not.toHaveProperty('item_origem_id')
  })

  it('vínculo com compra de outra fatura aparece como "Compra de outra fatura"', async () => {
    const { dialogo } = await abrirEdicao({}, { ...ESTORNO, item_origem_id: 999 })
    expect(within(dialogo).getByLabelText('Compra vinculada')).toHaveDisplayValue('Compra de outra fatura')
  })
})
