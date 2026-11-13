import { afterEach, describe, expect, it } from 'vitest'
import { configure, act, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { CartaoSaida, FaturaResumo, FaturaSaida, ItemFaturaSaida } from '../../api/cartoes'
import { erroApi, json, limparTudo, renderizarApp, semConteudo, simularApi } from '../../testes/utilitarios'

// O BottomSheet chama history.back() ao desmontar (popstate assíncrono): espera antes de limpar.
// Primeira renderização de cada arquivo é lenta com os workers em paralelo.
configure({ asyncUtilTimeout: 5000 })

afterEach(async () => {
  limparTudo()
  await new Promise((r) => setTimeout(r, 10))
})

const CATEGORIA = { id: 10, nome: 'Mercado', pai_nome: null, cor: '#112233', icone: 'tag' }

function resumo(sobre: Partial<FaturaResumo> = {}): FaturaResumo {
  return {
    cartao_id: 1,
    cartao_nome: 'Nubank',
    conta_id: 1,
    mes: '2026-10',
    id: 7,
    status: 'fechada',
    fechamento: '2026-10-10',
    vencimento: '2026-10-17',
    valor: '800.00',
    pagamento: null,
    ...sobre,
  }
}

function item(sobre: Partial<ItemFaturaSaida> = {}): ItemFaturaSaida {
  return {
    id: 100,
    tipo: 'compra',
    valor: '800.00',
    data: '2026-09-20',
    descricao: 'Supermercado',
    descricao_base: 'Supermercado',
    categoria: CATEGORIA,
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

function fatura(sobre: Partial<FaturaSaida> = {}): FaturaSaida {
  return {
    ...resumo(),
    bruto: '800.00',
    credito_recebido: '0.00',
    credito_repassado: '0.00',
    itens: [item()],
    conta_arquivada: false,
    pode_pagar: true,
    editavel: true,
    ...sobre,
  }
}

const cartaoLista: CartaoSaida = {
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
  fatura_corrente: resumo(),
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
  saldo_atual: '1000.00',
  saldo_previsto: '1000.00',
}

const CATEGORIAS = [
  {
    id: 10,
    nome: 'Mercado',
    tipo: 'despesa',
    icone: 'tag',
    cor: '#112233',
    fixa: false,
    arquivado: false,
    categoria_pai_id: null,
    subcategorias: [],
  },
]

function montar(f: FaturaSaida = fatura(), extra: Parameters<typeof simularApi>[0] = {}) {
  return simularApi({
    'GET /api/cartoes/1/faturas/2026-10': json(f),
    'GET /api/contas': json({ mes: '2026-10', contas: [CONTA], total_saldo_atual: null, total_saldo_previsto: null }),
    'GET /api/cartoes': json({ cartoes: [cartaoLista], limite_disponivel_total: null, total_faturas_mes: null }),
    'GET /api/cartoes/1/faturas': json({
      sugerida: '2026-10',
      faturas: [resumo({ mes: '2026-09', status: 'paga' }), resumo(), resumo({ mes: '2026-11', status: 'aberta' })],
    }),
    'GET /api/categorias': json(CATEGORIAS),
    'GET /api/tags': json([]),
    ...extra,
  })
}

async function abrir(rota = '/cartoes/1/faturas/2026-10') {
  const retorno = renderizarApp(rota)
  await screen.findByRole('heading', { name: 'Nubank' })
  return retorno
}

describe('detalhe da fatura (CA-4.07)', () => {
  it('mostra status, fechamento, vencimento e valor, e lista data, descrição, categoria e valor', async () => {
    montar(
      fatura({
        valor: '1000.00',
        itens: [
          item({ id: 1, valor: '600.00', data: '2026-09-20', descricao: 'Supermercado' }),
          item({
            id: 2,
            valor: '400.00',
            data: '2026-09-25',
            descricao: 'Geladeira (1/6)',
            descricao_base: 'Geladeira',
            categoria: { ...CATEGORIA, id: 11, nome: 'Casa', pai_nome: 'Moradia' },
            serie: { id: 3, tipo: 'parcelada', numero: 1, total: 6 },
          }),
        ],
      }),
    )
    await abrir()

    expect(screen.getByText('Fechada')).toBeInTheDocument()
    expect(screen.getByText('Fechamento').nextElementSibling).toHaveTextContent('10/10/2026')
    expect(screen.getByText('Vencimento').nextElementSibling).toHaveTextContent('17/10/2026')
    expect(screen.getByText('Valor').nextElementSibling).toHaveTextContent('R$ 1.000,00')
    const linhas = screen.getAllByRole('listitem')
    expect(linhas).toHaveLength(2)
    expect(linhas[0]).toHaveTextContent('Supermercado')
    expect(linhas[0]).toHaveTextContent('20/09/2026 · Mercado')
    expect(linhas[0]).toHaveTextContent('-R$ 600,00')
    expect(linhas[1]).toHaveTextContent('Geladeira (1/6)')
    expect(linhas[1]).toHaveTextContent('25/09/2026 · Moradia > Casa')
  })

  it('navega entre meses e busca a fatura do mês escolhido', async () => {
    const api = montar(fatura(), {
      'GET /api/cartoes/1/faturas/2026-11': json(
        fatura({ mes: '2026-11', valor: '300.00', itens: [item({ id: 5, descricao: 'Farmácia', valor: '300.00' })] }),
      ),
    })
    const { user } = await abrir()
    expect(screen.getByText('outubro de 2026')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'mês seguinte' }))

    expect(await screen.findByText('Farmácia')).toBeInTheDocument()
    expect(screen.getByText('novembro de 2026')).toBeInTheDocument()
    expect(api.chamadasDe('GET /api/cartoes/1/faturas/2026-11')).toHaveLength(1)
  })

  it('fatura sem itens mostra o estado vazio', async () => {
    montar(fatura({ itens: [], valor: '0.00', status: 'zerada', pode_pagar: false }))
    await abrir()
    expect(screen.getByText('Nenhum item nesta fatura.')).toBeInTheDocument()
    expect(screen.getByText('Zerada')).toBeInTheDocument()
  })

  it('mostra a mensagem do servidor quando a fatura não carrega', async () => {
    simularApi({ 'GET /api/cartoes/1/faturas/2026-10': erroApi(404, 'NAO_ENCONTRADO', 'Cartão não encontrado.') })
    renderizarApp('/cartoes/1/faturas/2026-10')
    expect(await screen.findByRole('alert')).toHaveTextContent('Cartão não encontrado.')
  })

  it('mês inválido na URL não quebra a tela e mostra o erro do servidor', async () => {
    simularApi({ 'GET /api/cartoes/1/faturas/abc': erroApi(422, 'VALIDACAO', 'Mês inválido.') })
    renderizarApp('/cartoes/1/faturas/abc')
    expect(await screen.findByRole('alert')).toHaveTextContent('Mês inválido.')
    expect(screen.queryByRole('button', { name: 'mês seguinte' })).not.toBeInTheDocument()
  })

  it('fatura não editável não oferece nova compra, estorno, ajuste, editar nem excluir', async () => {
    montar(fatura({ editavel: false, status: 'paga', pode_pagar: false }))
    await abrir()
    for (const nome of ['Nova compra', 'Lançar estorno', 'Ajustar fatura', 'Editar', 'Excluir']) {
      expect(screen.queryByRole('button', { name: nome })).not.toBeInTheDocument()
    }
  })

  it('o status vencida aparece com texto', async () => {
    montar(fatura({ status: 'vencida' }))
    await abrir()
    expect(screen.getByText('Vencida')).toBeInTheDocument()
  })
})

describe('estorno na lista (CA-4.16, lado da tela)', () => {
  it('mostra o estorno como -R$ 50,00 e o crédito de estorno no cabeçalho', async () => {
    montar(
      fatura({
        valor: '750.00',
        credito_recebido: '50.00',
        itens: [
          item({ id: 1 }),
          item({ id: 2, tipo: 'estorno', valor: '-50.00', descricao: 'Estorno Loja', item_origem_id: 1 }),
        ],
      }),
    )
    await abrir()

    const linha = screen.getByText('Estorno Loja').closest('li')!
    expect(linha).toHaveTextContent('-R$ 50,00')
    expect(screen.getByText('Valor').nextElementSibling).toHaveTextContent('R$ 750,00')
    expect(screen.getByText('Crédito de estorno').nextElementSibling).toHaveTextContent('+R$ 50,00')
  })

  it('sem crédito recebido o cabeçalho não mostra "Crédito de estorno"', async () => {
    montar()
    await abrir()
    expect(screen.queryByText('Crédito de estorno')).not.toBeInTheDocument()
  })

  it('ajuste mostra "Reajuste de fatura" e só oferece Excluir, sem Editar', async () => {
    montar(fatura({ itens: [item({ id: 3, tipo: 'ajuste', valor: '10.00', descricao: 'Ajuste', categoria: null })] }))
    await abrir()
    const linha = screen.getByText('Ajuste').closest('li')!
    expect(linha).toHaveTextContent('Reajuste de fatura')
    expect(within(linha).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(within(linha).getByRole('button', { name: 'Excluir' })).toBeInTheDocument()
  })
})

describe('nova compra pela fatura (CA-4.13, CA-4.08)', () => {
  it('abre o formulário com cartão e fatura da tela e sem opção de situação', async () => {
    montar()
    const { user } = await abrir()

    await user.click(screen.getByRole('button', { name: 'Nova compra' }))

    const dialogo = await screen.findByRole('dialog', { name: 'Nova despesa no cartão' })
    await waitFor(() => expect(within(dialogo).getByLabelText('Cartão')).toHaveDisplayValue('Nubank'))
    await waitFor(() => expect(within(dialogo).getByLabelText('Fatura de destino')).toHaveValue('2026-10'))
    expect(within(dialogo).queryByText('Foi paga')).not.toBeInTheDocument()
    expect(within(dialogo).queryByRole('switch', { name: /paga/i })).not.toBeInTheDocument()
  })
})

describe('pagar fatura (CA-4.14)', () => {
  it('mostra valor total e conta dona, sem campo de valor nem de conta, e paga com a data de hoje', async () => {
    const api = montar(fatura(), { 'POST /api/cartoes/1/faturas/2026-10/pagamento': json(fatura(), 200) })
    const { user } = await abrir()

    await user.click(screen.getByRole('button', { name: 'Pagar fatura' }))

    const sheet = await screen.findByRole('dialog', { name: 'Pagar fatura' })
    expect(within(sheet).getByText('Valor da fatura').nextElementSibling).toHaveTextContent('R$ 800,00')
    await waitFor(() =>
      expect(within(sheet).getByText('Conta').nextElementSibling).toHaveTextContent('Conta Conjunta'),
    )
    expect(within(sheet).queryByLabelText('Valor')).not.toBeInTheDocument()
    expect(within(sheet).queryByLabelText(/Conta/)).not.toBeInTheDocument()
    await waitFor(() => expect(within(sheet).getByLabelText('Data')).toHaveValue('2026-10-15'))

    await user.click(within(sheet).getByRole('button', { name: 'Pagar' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Pagar fatura' })).not.toBeInTheDocument())
    const post = api.chamadasDe('POST /api/cartoes/1/faturas/2026-10/pagamento')
    expect(post).toHaveLength(1)
    expect(post[0]?.corpo).toEqual({ data: '2026-10-15' })
  })

  it('o atalho Ontem envia o dia anterior', async () => {
    const api = montar(fatura(), { 'POST /api/cartoes/1/faturas/2026-10/pagamento': json(fatura()) })
    const { user } = await abrir()
    await user.click(screen.getByRole('button', { name: 'Pagar fatura' }))
    const sheet = await screen.findByRole('dialog', { name: 'Pagar fatura' })
    await waitFor(() => expect(within(sheet).getByRole('button', { name: 'Ontem' })).toBeEnabled())

    await user.click(within(sheet).getByRole('button', { name: 'Ontem' }))
    await user.click(within(sheet).getByRole('button', { name: 'Pagar' }))

    await waitFor(() => expect(api.chamadasDe('POST /api/cartoes/1/faturas/2026-10/pagamento')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/cartoes/1/faturas/2026-10/pagamento')[0]?.corpo).toEqual({ data: '2026-10-14' })
  })

  it('com a data limpa o botão Pagar fica desabilitado', async () => {
    montar()
    const { user } = await abrir()
    await user.click(screen.getByRole('button', { name: 'Pagar fatura' }))
    const sheet = await screen.findByRole('dialog', { name: 'Pagar fatura' })
    const data = within(sheet).getByLabelText('Data')
    await waitFor(() => expect(data).toHaveValue('2026-10-15'))

    await user.clear(data)

    expect(within(sheet).getByRole('button', { name: 'Pagar' })).toBeDisabled()
  })

  it('Cancelar fecha o sheet sem chamar o servidor', async () => {
    const api = montar()
    const { user } = await abrir()
    await user.click(screen.getByRole('button', { name: 'Pagar fatura' }))
    const sheet = await screen.findByRole('dialog', { name: 'Pagar fatura' })

    await user.click(within(sheet).getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.chamadasDe('POST /api/cartoes/1/faturas/2026-10/pagamento')).toHaveLength(0)
  })

  it('erro do servidor no pagamento aparece no sheet, que continua aberto', async () => {
    montar(fatura(), {
      'POST /api/cartoes/1/faturas/2026-10/pagamento': erroApi(409, 'FATURA_ZERADA', 'Fatura sem valor a pagar.'),
    })
    const { user } = await abrir()
    await user.click(screen.getByRole('button', { name: 'Pagar fatura' }))
    const sheet = await screen.findByRole('dialog', { name: 'Pagar fatura' })
    await waitFor(() => expect(within(sheet).getByLabelText('Data')).toHaveValue('2026-10-15'))

    await user.click(within(sheet).getByRole('button', { name: 'Pagar' }))

    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Fatura sem valor a pagar.')
  })

  it('erro de data vindo do servidor aparece no campo Data', async () => {
    montar(fatura(), {
      'POST /api/cartoes/1/faturas/2026-10/pagamento': erroApi(422, 'VALIDACAO', 'Dados inválidos.', {
        data: 'Data inválida.',
      }),
    })
    const { user } = await abrir()
    await user.click(screen.getByRole('button', { name: 'Pagar fatura' }))
    const sheet = await screen.findByRole('dialog', { name: 'Pagar fatura' })
    await waitFor(() => expect(within(sheet).getByLabelText('Data')).toHaveValue('2026-10-15'))
    await user.click(within(sheet).getByRole('button', { name: 'Pagar' }))

    expect(await within(sheet).findByText('Data inválida.')).toBeInTheDocument()
  })

  it('fatura que não pode ser paga (zerada) não mostra Pagar fatura', async () => {
    montar(fatura({ status: 'zerada', valor: '0.00', itens: [], pode_pagar: false }))
    await abrir()
    expect(screen.queryByRole('button', { name: 'Pagar fatura' })).not.toBeInTheDocument()
  })

  it('pagamento previsto oferece Confirmar e Cancelar, e confirma pela rota própria', async () => {
    const api = montar(
      fatura({
        pagamento: { lancamento_id: 9, data: '2026-10-20', situacao: 'prevista', valor: '800.00' },
        pode_pagar: false,
      }),
      { 'POST /api/cartoes/1/faturas/2026-10/pagamento/confirmar': json(fatura()) },
    )
    const { user } = await abrir()
    expect(screen.queryByRole('button', { name: 'Pagar fatura' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar pagamento previsto' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Confirmar pagamento' }))

    await waitFor(() =>
      expect(api.chamadasDe('POST /api/cartoes/1/faturas/2026-10/pagamento/confirmar')).toHaveLength(1),
    )
  })

  it('cancelar o pagamento previsto chama DELETE do pagamento', async () => {
    const api = montar(
      fatura({
        pagamento: { lancamento_id: 9, data: '2026-10-20', situacao: 'prevista', valor: '800.00' },
        pode_pagar: false,
      }),
      { 'DELETE /api/cartoes/1/faturas/2026-10/pagamento': semConteudo() },
    )
    const { user } = await abrir()
    await user.click(screen.getByRole('button', { name: 'Cancelar pagamento previsto' }))
    await waitFor(() => expect(api.chamadasDe('DELETE /api/cartoes/1/faturas/2026-10/pagamento')).toHaveLength(1))
  })

  it('pagamento confirmado oferece Desfazer, que pede confirmação; sem confirmar nada muda', async () => {
    const api = montar(
      fatura({
        status: 'paga',
        pagamento: { lancamento_id: 9, data: '2026-10-12', situacao: 'confirmada', valor: '800.00' },
        pode_pagar: false,
      }),
      { 'DELETE /api/cartoes/1/faturas/2026-10/pagamento': semConteudo() },
    )
    const { user } = await abrir()

    await user.click(screen.getByRole('button', { name: 'Desfazer pagamento' }))
    expect(await screen.findByRole('dialog', { name: 'Desfazer pagamento' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.chamadasDe('DELETE /api/cartoes/1/faturas/2026-10/pagamento')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Desfazer pagamento' }))
    await user.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(api.chamadasDe('DELETE /api/cartoes/1/faturas/2026-10/pagamento')).toHaveLength(1))
  })
})

describe('conta arquivada (CA-4.22, D-047, D-048)', () => {
  const arquivada = (sobre: Partial<FaturaSaida> = {}) =>
    fatura({ conta_arquivada: true, editavel: false, pode_pagar: false, ...sobre })

  it('mostra o aviso fixo no lugar das ações de pagamento em fatura paga', async () => {
    montar(
      arquivada({
        status: 'paga',
        pagamento: { lancamento_id: 9, data: '2026-10-12', situacao: 'confirmada', valor: '800.00' },
      }),
    )
    await abrir()

    expect(screen.getByText('Conta arquivada: a fatura é só para consulta')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Desfazer pagamento' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pagar fatura' })).not.toBeInTheDocument()
  })

  it('mostra o aviso e esconde Confirmar e Cancelar quando o pagamento era previsto', async () => {
    montar(
      arquivada({ pagamento: { lancamento_id: 9, data: '2026-10-20', situacao: 'prevista', valor: '800.00' } }),
    )
    await abrir()
    expect(screen.getByText('Conta arquivada: a fatura é só para consulta')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirmar pagamento' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar pagamento previsto' })).not.toBeInTheDocument()
  })

  it('o aviso aparece também sem pagamento e sem ações de edição da fatura', async () => {
    montar(arquivada())
    await abrir()
    expect(screen.getByText('Conta arquivada: a fatura é só para consulta')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nova compra' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajustar fatura' })).not.toBeInTheDocument()
  })

  it('conta ativa não mostra o aviso', async () => {
    montar()
    await abrir()
    expect(screen.queryByText(/Conta arquivada/)).not.toBeInTheDocument()
  })

  it('409 CONTA_ARQUIVADA do servidor ao pagar aparece como erro no sheet', async () => {
    // Fatura ainda editável no cliente (dados defasados), mas o servidor recusa.
    montar(fatura(), {
      'POST /api/cartoes/1/faturas/2026-10/pagamento': erroApi(
        409,
        'CONTA_ARQUIVADA',
        'A conta do cartão está arquivada.',
      ),
    })
    const { user } = await abrir()
    await user.click(screen.getByRole('button', { name: 'Pagar fatura' }))
    const sheet = await screen.findByRole('dialog', { name: 'Pagar fatura' })
    await waitFor(() => expect(within(sheet).getByLabelText('Data')).toHaveValue('2026-10-15'))

    await user.click(within(sheet).getByRole('button', { name: 'Pagar' }))

    expect(await within(sheet).findByRole('alert')).toHaveTextContent('A conta do cartão está arquivada.')
  })

  it('409 CONTA_ARQUIVADA ao desfazer o pagamento aparece como erro e a fatura segue paga', async () => {
    montar(
      fatura({
        status: 'paga',
        pagamento: { lancamento_id: 9, data: '2026-10-12', situacao: 'confirmada', valor: '800.00' },
        pode_pagar: false,
      }),
      {
        'DELETE /api/cartoes/1/faturas/2026-10/pagamento': erroApi(
          409,
          'CONTA_ARQUIVADA',
          'A conta do cartão está arquivada.',
        ),
      },
    )
    const { user } = await abrir()
    await user.click(screen.getByRole('button', { name: 'Desfazer pagamento' }))
    await user.click(await screen.findByRole('button', { name: 'Desfazer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('A conta do cartão está arquivada.')
    expect(screen.getByText('Paga')).toBeInTheDocument()
  })
})

describe('ajustar fatura (CA-4.17)', () => {
  async function abrirAjuste(f = fatura({ valor: '750.00' }), extra: Parameters<typeof simularApi>[0] = {}) {
    const api = montar(f, extra)
    const { user } = await abrir()
    await user.click(screen.getByRole('button', { name: 'Ajustar fatura' }))
    const sheet = await screen.findByRole('dialog', { name: 'Ajustar fatura' })
    return { api, user, sheet }
  }

  it('começa com o valor atual e envia o valor do banco R$ 760,00', async () => {
    const { api, user, sheet } = await abrirAjuste(fatura({ valor: '750.00' }), {
      'POST /api/cartoes/1/faturas/2026-10/ajuste': json({ item: item({ tipo: 'ajuste' }), fatura: fatura() }),
    })
    const campo = within(sheet).getByLabelText('Valor conforme o banco')
    expect(within(sheet).getByText('Valor atual').nextElementSibling).toHaveTextContent('R$ 750,00')
    expect(campo).toHaveValue('750,00')

    await user.clear(campo)
    await user.type(campo, '76000')
    expect(campo).toHaveValue('760,00')
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ajustar fatura' })).not.toBeInTheDocument())
    expect(api.chamadasDe('POST /api/cartoes/1/faturas/2026-10/ajuste')[0]?.corpo).toEqual({ valor_banco: '760.00' })
  })

  it('valor menor (R$ 740,00) é enviado do mesmo jeito para o servidor calcular o ajuste negativo', async () => {
    const { api, user, sheet } = await abrirAjuste(fatura({ valor: '750.00' }), {
      'POST /api/cartoes/1/faturas/2026-10/ajuste': json({ item: item({ tipo: 'ajuste', valor: '-10.00' }), fatura: fatura() }),
    })
    const campo = within(sheet).getByLabelText('Valor conforme o banco')
    await user.clear(campo)
    await user.type(campo, '74000')
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(api.chamadasDe('POST /api/cartoes/1/faturas/2026-10/ajuste')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/cartoes/1/faturas/2026-10/ajuste')[0]?.corpo).toEqual({ valor_banco: '740.00' })
  })

  it('o mesmo valor (resposta com item null) só fecha o sheet', async () => {
    const { api, user, sheet } = await abrirAjuste(fatura({ valor: '750.00' }), {
      'POST /api/cartoes/1/faturas/2026-10/ajuste': json({ item: null, fatura: fatura({ valor: '750.00' }) }),
    })
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ajustar fatura' })).not.toBeInTheDocument())
    expect(api.chamadasDe('POST /api/cartoes/1/faturas/2026-10/ajuste')[0]?.corpo).toEqual({ valor_banco: '750.00' })
  })

  it('valor negativo recusado pelo servidor aparece no campo e o sheet continua aberto', async () => {
    const { user, sheet } = await abrirAjuste(fatura({ valor: '750.00' }), {
      'POST /api/cartoes/1/faturas/2026-10/ajuste': erroApi(422, 'VALIDACAO', 'Dados inválidos.', {
        valor_banco: 'O valor não pode ser negativo.',
      }),
    })
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }))

    expect(await within(sheet).findByText('O valor não pode ser negativo.')).toBeInTheDocument()
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Dados inválidos.')
    expect(screen.getByRole('dialog', { name: 'Ajustar fatura' })).toBeInTheDocument()
  })

  it('fatura paga recusada pelo servidor mostra a mensagem (CA-4.19)', async () => {
    const { user, sheet } = await abrirAjuste(fatura({ valor: '750.00' }), {
      'POST /api/cartoes/1/faturas/2026-10/ajuste': erroApi(409, 'FATURA_PAGA', 'A fatura já está paga: escolha outra.'),
    })
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }))
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('A fatura já está paga: escolha outra.')
  })

  it('Cancelar fecha sem chamar o servidor', async () => {
    const { api, user, sheet } = await abrirAjuste()
    await user.click(within(sheet).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.chamadasDe('POST /api/cartoes/1/faturas/2026-10/ajuste')).toHaveLength(0)
  })
})

describe('?pagar=1 (t164c/t164d)', () => {
  it('abre o sheet de pagamento uma vez e o Cancelar não o reabre', async () => {
    montar()
    const { user } = renderizarApp('/cartoes/1/faturas/2026-10?pagar=1')

    const sheet = await screen.findByRole('dialog', { name: 'Pagar fatura' })
    await user.click(within(sheet).getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('o Voltar do navegador fecha o sheet e não o reabre', async () => {
    montar()
    renderizarApp('/cartoes/1/faturas/2026-10?pagar=1')
    await screen.findByRole('dialog', { name: 'Pagar fatura' })
    // Tempo para o ?pagar=1 sair da URL (a pessoa não aperta Voltar no mesmo instante).
    await new Promise((r) => setTimeout(r, 50))

    // Voltar sai da entrada criada pelo sheet: popstate sem o estado `bottomSheet` (determinístico em jsdom).
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    })

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('com a fatura que não pode ser paga o sheet não abre', async () => {
    montar(fatura({ pode_pagar: false, status: 'zerada', valor: '0.00', itens: [] }))
    renderizarApp('/cartoes/1/faturas/2026-10?pagar=1')
    await screen.findByRole('heading', { name: 'Nubank' })
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sem o parâmetro o sheet não abre sozinho', async () => {
    montar()
    await abrir()
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('editar e excluir itens (CA-4.11, lado da tela)', () => {
  const parcela = item({
    id: 4,
    valor: '200.00',
    descricao: 'Geladeira (4/6)',
    descricao_base: 'Geladeira',
    serie: { id: 3, tipo: 'parcelada', numero: 4, total: 6 },
  })

  it('compra à vista abre o formulário direto, sem perguntar o alcance', async () => {
    montar()
    const { user } = await abrir()
    await user.click(screen.getByRole('button', { name: 'Editar' }))

    expect(await screen.findByRole('dialog', { name: 'Editar despesa no cartão' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Editar compra' })).not.toBeInTheDocument()
  })

  it('compra em série pergunta o alcance e, ao escolher, o sheet do alcance dá lugar ao formulário', async () => {
    montar(fatura({ itens: [parcela] }))
    const { user } = await abrir()
    await user.click(screen.getByRole('button', { name: 'Editar' }))

    const alcance = await screen.findByRole('dialog', { name: 'Editar compra' })
    expect(within(alcance).getByRole('button', { name: 'Somente esta' })).toBeInTheDocument()
    expect(within(alcance).getByRole('button', { name: 'Esta e as pendentes' })).toBeInTheDocument()
    expect(within(alcance).getByRole('button', { name: 'Todas (incluindo efetivadas)' })).toBeInTheDocument()

    await user.click(within(alcance).getByRole('button', { name: 'Esta e as pendentes' }))

    expect(await screen.findByRole('dialog', { name: 'Editar despesa no cartão' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Editar compra' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it('o alcance escolhido vai na query do PATCH', async () => {
    const api = montar(fatura({ itens: [parcela] }), { 'PATCH /api/itens-fatura/4': json(parcela) })
    const { user } = await abrir()
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await user.click(await screen.findByRole('button', { name: 'Somente esta' }))
    const form = await screen.findByRole('dialog', { name: 'Editar despesa no cartão' })
    await waitFor(() => expect(within(form).getByLabelText('Descrição')).toHaveValue('Geladeira'))
    await waitFor(() => expect(within(form).getByLabelText('Fatura de destino')).toHaveValue('2026-10'))
    await waitFor(() => expect(within(form).getByLabelText('Cartão')).toHaveDisplayValue('Nubank'))

    await user.type(within(form).getByLabelText('Descrição'), ' nova')
    await user.click(within(form).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(api.chamadasDe('PATCH /api/itens-fatura/4')).toHaveLength(1))
    expect(api.chamadasDe('PATCH /api/itens-fatura/4')[0]?.params).toEqual({ alcance: 'somente_este' })
  })

  it('cancelar o alcance não abre o formulário', async () => {
    montar(fatura({ itens: [parcela] }))
    const { user } = await abrir()
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    const alcance = await screen.findByRole('dialog', { name: 'Editar compra' })

    await user.click(within(alcance).getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('excluir compra em série pergunta o alcance e envia DELETE com ele', async () => {
    const api = montar(fatura({ itens: [parcela] }), { 'DELETE /api/itens-fatura/4': semConteudo() })
    const { user } = await abrir()
    await user.click(screen.getByRole('button', { name: 'Excluir' }))

    const alcance = await screen.findByRole('dialog', { name: 'Excluir compra' })
    await user.click(within(alcance).getByRole('button', { name: 'Todas (incluindo efetivadas)' }))

    await waitFor(() => expect(api.chamadasDe('DELETE /api/itens-fatura/4')).toHaveLength(1))
    expect(api.chamadasDe('DELETE /api/itens-fatura/4')[0]?.params).toEqual({ alcance: 'todos' })
  })

  it('excluir item sem série pede confirmação simples e não envia alcance', async () => {
    const api = montar(fatura(), { 'DELETE /api/itens-fatura/100': semConteudo() })
    const { user } = await abrir()
    await user.click(screen.getByRole('button', { name: 'Excluir' }))

    const dialogo = await screen.findByRole('dialog', { name: 'Excluir item' })
    await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }))

    await waitFor(() => expect(api.chamadasDe('DELETE /api/itens-fatura/100')).toHaveLength(1))
    expect(api.chamadasDe('DELETE /api/itens-fatura/100')[0]?.params).toEqual({})
  })

  it('exclusão recusada mostra o erro do servidor', async () => {
    montar(fatura(), {
      'DELETE /api/itens-fatura/100': erroApi(409, 'FATURA_PAGA', 'A fatura já está paga.'),
    })
    const { user } = await abrir()
    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir item' })
    await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('A fatura já está paga.')
  })

  it('editar um estorno abre o formulário de estorno, não o de compra', async () => {
    montar(
      fatura({
        itens: [item({ id: 8, tipo: 'estorno', valor: '-50.00', descricao: 'Estorno Loja', item_origem_id: 100 }), item()],
      }),
    )
    const { user } = await abrir()
    const linha = screen.getByText('Estorno Loja').closest('li')!
    await user.click(within(linha).getByRole('button', { name: 'Editar' }))
    expect(await screen.findByRole('dialog', { name: 'Editar estorno' })).toBeInTheDocument()
  })
})
