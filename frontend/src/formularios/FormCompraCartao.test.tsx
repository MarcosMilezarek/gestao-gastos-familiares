import { afterEach, describe, expect, it } from 'vitest'
import { configure, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { CartaoSaida, FaturaResumo, ItemFaturaSaida } from '../api/cartoes'
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
    id: null,
    status,
    fechamento: `${mes}-10`,
    vencimento: `${mes}-17`,
    valor: '0.00',
    pagamento: null,
  }
}

const CARTAO: CartaoSaida = {
  id: 1,
  nome: 'Nubank',
  conta_id: 1,
  dono_usuario_id: null,
  limite: '5000.00',
  dia_fechamento: 10,
  dia_vencimento: 17,
  bandeira: null,
  conta_arquivada: false,
  limite_usado: '0.00',
  limite_disponivel: '5000.00',
  uso_porcentagem: '0.00',
  fatura_corrente: resumo('2026-10'),
}

const listaCartoes = (cartoes: CartaoSaida[]) =>
  json({ cartoes, limite_disponivel_total: null, total_faturas_mes: null })

const CATEGORIAS = [
  {
    id: 10,
    nome: 'Eletro',
    tipo: 'despesa',
    icone: 'tag',
    cor: '#112233',
    fixa: false,
    arquivado: false,
    categoria_pai_id: null,
    subcategorias: [],
  },
]

const FATURAS = {
  sugerida: '2026-10',
  faturas: [resumo('2026-09', 'paga'), resumo('2026-10'), resumo('2026-11')],
}

function montar(extra: Parameters<typeof simularApi>[0] = {}) {
  return simularApi({
    'GET /api/cartoes': listaCartoes([CARTAO]),
    'GET /api/cartoes/1/faturas': ({ params }) =>
      json(params.data?.startsWith('2026-11') ? { ...FATURAS, sugerida: '2026-11' } : FATURAS),
    'GET /api/categorias': json(CATEGORIAS),
    'GET /api/tags': json([{ id: 1, nome: 'casa' }]),
    'GET /api/contas': json({ mes: '2026-10', contas: [], total_saldo_atual: null, total_saldo_previsto: null }),
    'POST /api/cartoes/1/compras': json({ id: 1 }, 201),
    ...extra,
  })
}

// "+" > "Despesa no cartão", a partir da tela Cartões.
async function abrirForm() {
  const retorno = renderizarApp('/cartoes')
  await screen.findByRole('heading', { name: 'Cartões' })
  await retorno.user.click(screen.getByRole('button', { name: 'Novo lançamento' }))
  await retorno.user.click(await screen.findByRole('button', { name: 'Despesa no cartão' }))
  const dialogo = await screen.findByRole('dialog', { name: 'Nova despesa no cartão' })
  await waitFor(() => expect(within(dialogo).getByRole('option', { name: 'Nubank' })).toBeInTheDocument())
  await waitFor(() => expect(within(dialogo).getByRole('option', { name: 'Eletro' })).toBeInTheDocument())
  return { ...retorno, dialogo }
}

type Usuario = Awaited<ReturnType<typeof abrirForm>>['user']

async function preencherBasico(user: Usuario, dialogo: HTMLElement, valor = '10000', descricao = 'Geladeira') {
  await user.type(within(dialogo).getByLabelText('Valor'), valor)
  await user.type(within(dialogo).getByLabelText('Descrição'), descricao)
  await user.selectOptions(within(dialogo).getByLabelText('Categoria'), 'Eletro')
  await user.selectOptions(within(dialogo).getByLabelText('Cartão'), 'Nubank')
}

describe('formulário Despesa no cartão (CA-4.08)', () => {
  it('abre com valor, data, descrição, categoria, cartão e fatura, sem os detalhes', async () => {
    montar()
    const { dialogo } = await abrirForm()

    for (const rotulo of ['Valor', 'Data', 'Descrição', 'Categoria', 'Cartão', 'Fatura de destino']) {
      expect(within(dialogo).getByLabelText(rotulo)).toBeInTheDocument()
    }
    expect(within(dialogo).queryByText('Tags')).not.toBeInTheDocument()
    expect(within(dialogo).queryByLabelText('Observação')).not.toBeInTheDocument()
    expect(within(dialogo).queryByRole('switch', { name: 'Recorrente' })).not.toBeInTheDocument()
    expect(within(dialogo).queryByRole('switch', { name: 'Parcelada' })).not.toBeInTheDocument()
  })

  it('"Mais detalhes" mostra tags, observação, recorrente e parcelada', async () => {
    montar()
    const { dialogo, user } = await abrirForm()

    await user.click(within(dialogo).getByRole('button', { name: 'Mais detalhes' }))

    expect(within(dialogo).getByText('Tags')).toBeInTheDocument()
    expect(within(dialogo).getByLabelText('Observação')).toBeInTheDocument()
    expect(within(dialogo).getByRole('switch', { name: 'Recorrente' })).toBeInTheDocument()
    expect(within(dialogo).getByRole('switch', { name: 'Parcelada' })).toBeInTheDocument()
  })

  it('a fatura vem sugerida pela data e faturas pagas ficam desabilitadas', async () => {
    montar()
    const { dialogo, user } = await abrirForm()
    await user.selectOptions(within(dialogo).getByLabelText('Cartão'), 'Nubank')

    await waitFor(() => expect(within(dialogo).getByLabelText('Fatura de destino')).toHaveValue('2026-10'))
    expect(within(dialogo).getByRole('option', { name: /setembro de 2026 · Paga/ })).toBeDisabled()
    expect(within(dialogo).getByRole('option', { name: /novembro de 2026 · Aberta/ })).toBeEnabled()
  })

  it('a consulta de faturas usa a data do formulário', async () => {
    const api = montar()
    const { dialogo, user } = await abrirForm()
    await user.selectOptions(within(dialogo).getByLabelText('Cartão'), 'Nubank')

    await waitFor(() =>
      expect(api.chamadasDe('GET /api/cartoes/1/faturas').some((c) => c.params.data === '2026-10-15')).toBe(true),
    )
  })

  it('trocar para outra fatura do cartão envia o mês escolhido', async () => {
    const api = montar()
    const { dialogo, user } = await abrirForm()
    await preencherBasico(user, dialogo)
    await waitFor(() => expect(within(dialogo).getByLabelText('Fatura de destino')).toHaveValue('2026-10'))

    await user.selectOptions(within(dialogo).getByLabelText('Fatura de destino'), '2026-11')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(api.chamadasDe('POST /api/cartoes/1/compras')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/cartoes/1/compras')[0]?.corpo).toMatchObject({
      valor: '100.00',
      descricao: 'Geladeira',
      categoria_id: 10,
      data: '2026-10-15',
      fatura_mes: '2026-11',
    })
  })

  it('compra à vista não envia parcelas nem recorrência, e Salvar fecha o formulário', async () => {
    const api = montar()
    const { dialogo, user } = await abrirForm()
    await preencherBasico(user, dialogo)
    await waitFor(() => expect(within(dialogo).getByLabelText('Fatura de destino')).toHaveValue('2026-10'))

    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova despesa no cartão' })).not.toBeInTheDocument())
    const corpo = api.chamadasDe('POST /api/cartoes/1/compras')[0]?.corpo as Record<string, unknown>
    expect(corpo).not.toHaveProperty('parcelas')
    expect(corpo).not.toHaveProperty('recorrencia')
  })

  it('compra com valor 0 recusada pelo servidor mostra a mensagem no campo Valor, com foco', async () => {
    montar({
      'POST /api/cartoes/1/compras': erroApi(422, 'VALIDACAO', 'Dados inválidos.', {
        valor: 'O valor deve ser maior que zero.',
      }),
    })
    const { dialogo, user } = await abrirForm()
    await preencherBasico(user, dialogo, '0')
    await waitFor(() => expect(within(dialogo).getByLabelText('Fatura de destino')).toHaveValue('2026-10'))

    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    expect(await within(dialogo).findByText('O valor deve ser maior que zero.')).toBeInTheDocument()
    await waitFor(() => expect(within(dialogo).getByLabelText('Valor')).toHaveFocus())
    expect(screen.getByRole('dialog', { name: 'Nova despesa no cartão' })).toBeInTheDocument()
  })

  it('"Salvar e criar nova" mantém o formulário aberto e limpo', async () => {
    const api = montar()
    const { dialogo, user } = await abrirForm()
    await preencherBasico(user, dialogo)
    await waitFor(() => expect(within(dialogo).getByLabelText('Fatura de destino')).toHaveValue('2026-10'))

    await user.click(within(dialogo).getByRole('button', { name: 'Salvar e criar nova' }))

    await waitFor(() => expect(api.chamadasDe('POST /api/cartoes/1/compras')).toHaveLength(1))
    await waitFor(() => expect(within(dialogo).getByLabelText('Valor')).toHaveValue(''))
    expect(within(dialogo).getByLabelText('Descrição')).toHaveValue('')
    expect(screen.getByRole('dialog', { name: 'Nova despesa no cartão' })).toBeInTheDocument()
  })

  it('sem cartão cadastrado avisa, oferece o cadastro e desabilita Salvar', async () => {
    montar({ 'GET /api/cartoes': listaCartoes([]) })
    const retorno = renderizarApp('/cartoes')
    await screen.findByText('Nenhum cartão cadastrado.')
    await retorno.user.click(screen.getByRole('button', { name: 'Novo lançamento' }))
    await retorno.user.click(await screen.findByRole('button', { name: 'Despesa no cartão' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Nova despesa no cartão' })

    expect(await within(dialogo).findByText(/Cadastre um cartão antes de lançar uma compra/)).toBeInTheDocument()
    expect(within(dialogo).getByRole('link', { name: 'Cadastrar cartão' })).toHaveAttribute('href', '/cartoes/novo')
    expect(within(dialogo).getByRole('button', { name: 'Salvar' })).toBeDisabled()
    expect(within(dialogo).getByRole('button', { name: 'Salvar e criar nova' })).toBeDisabled()
  })

  it('falha ao carregar os cartões é avisada no formulário', async () => {
    montar({ 'GET /api/cartoes': erroApi(403, 'SEM_PERMISSAO', 'Sem permissão.') })
    const retorno = renderizarApp('/controle')
    await retorno.user.click(await screen.findByRole('button', { name: 'Novo lançamento' }))
    await retorno.user.click(await screen.findByRole('button', { name: 'Despesa no cartão' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Nova despesa no cartão' })
    expect(await within(dialogo).findByText('Não foi possível carregar os cartões. Tente novamente.')).toBeInTheDocument()
  })
})

describe('compra em fatura paga (CA-4.19)', () => {
  it('data que cai em fatura paga não preenche a fatura e orienta a escolher outra', async () => {
    montar({
      'GET /api/cartoes/1/faturas': json({ sugerida: '2026-09', faturas: FATURAS.faturas }),
    })
    const { dialogo, user } = await abrirForm()
    await user.selectOptions(within(dialogo).getByLabelText('Cartão'), 'Nubank')

    expect(await within(dialogo).findByText('A fatura da data já está paga: escolha outra')).toBeInTheDocument()
    expect(within(dialogo).getByLabelText('Fatura de destino')).toHaveValue('')
  })

  it('409 FATURA_PAGA do servidor aparece como mensagem no formulário, que continua aberto', async () => {
    montar({
      'POST /api/cartoes/1/compras': erroApi(409, 'FATURA_PAGA', 'A fatura já está paga: escolha outra fatura.'),
    })
    const { dialogo, user } = await abrirForm()
    await preencherBasico(user, dialogo)
    await waitFor(() => expect(within(dialogo).getByLabelText('Fatura de destino')).toHaveValue('2026-10'))

    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('A fatura já está paga: escolha outra fatura.')
    expect(screen.getByRole('dialog', { name: 'Nova despesa no cartão' })).toBeInTheDocument()
  })
})

describe('compra parcelada (CA-4.09, lado da tela)', () => {
  it('Geladeira de R$ 1.200,00 em 6x com fatura de março envia valor total, 6 parcelas e a fatura', async () => {
    const api = montar({
      'GET /api/cartoes/1/faturas': json({
        sugerida: '2026-03',
        faturas: [resumo('2026-02'), resumo('2026-03'), resumo('2026-04')],
      }),
    })
    const { dialogo, user } = await abrirForm()
    await preencherBasico(user, dialogo, '120000')
    await user.click(within(dialogo).getByRole('button', { name: 'Mais detalhes' }))
    await user.click(within(dialogo).getByRole('switch', { name: 'Parcelada' }))
    await user.type(within(dialogo).getByLabelText('Número de parcelas'), '6')
    await waitFor(() => expect(within(dialogo).getByLabelText('Fatura de destino')).toHaveValue('2026-03'))

    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(api.chamadasDe('POST /api/cartoes/1/compras')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/cartoes/1/compras')[0]?.corpo).toMatchObject({
      valor: '1200.00',
      descricao: 'Geladeira',
      fatura_mes: '2026-03',
      parcelas: 6,
    })
  })

  it('ligar parcelada desliga a recorrência e vice-versa', async () => {
    montar()
    const { dialogo, user } = await abrirForm()
    await user.click(within(dialogo).getByRole('button', { name: 'Mais detalhes' }))
    const parcelada = within(dialogo).getByRole('switch', { name: 'Parcelada' })
    const recorrente = within(dialogo).getByRole('switch', { name: 'Recorrente' })

    await user.click(recorrente)
    expect(recorrente).toHaveAttribute('aria-checked', 'true')
    await user.click(parcelada)
    expect(parcelada).toHaveAttribute('aria-checked', 'true')
    expect(recorrente).toHaveAttribute('aria-checked', 'false')
    await user.click(recorrente)
    expect(parcelada).toHaveAttribute('aria-checked', 'false')
  })

  it('37 parcelas recusadas pelo servidor aparecem no campo de parcelas', async () => {
    montar({
      'POST /api/cartoes/1/compras': erroApi(422, 'VALIDACAO', 'Dados inválidos.', {
        parcelas: 'O número de parcelas deve estar entre 2 e 36.',
      }),
    })
    const { dialogo, user } = await abrirForm()
    await preencherBasico(user, dialogo)
    await user.click(within(dialogo).getByRole('button', { name: 'Mais detalhes' }))
    await user.click(within(dialogo).getByRole('switch', { name: 'Parcelada' }))
    await user.type(within(dialogo).getByLabelText('Número de parcelas'), '37')
    await waitFor(() => expect(within(dialogo).getByLabelText('Fatura de destino')).toHaveValue('2026-10'))

    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    expect(await within(dialogo).findByText('O número de parcelas deve estar entre 2 e 36.')).toBeInTheDocument()
  })
})

describe('sem situação prevista/confirmada (CA-4.13)', () => {
  it('o formulário não oferece escolher a situação, mesmo com data futura', async () => {
    const api = montar()
    const { dialogo, user } = await abrirForm()
    await preencherBasico(user, dialogo)
    const data = within(dialogo).getByLabelText('Data')
    await user.clear(data)
    await user.type(data, '2026-12-20')
    await waitFor(() => expect(within(dialogo).getByLabelText('Fatura de destino')).not.toHaveValue(''))

    expect(within(dialogo).queryByText('Foi paga')).not.toBeInTheDocument()
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.chamadasDe('POST /api/cartoes/1/compras')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/cartoes/1/compras')[0]?.corpo).not.toHaveProperty('situacao')
  })
})

describe('foco no primeiro campo inválido (t164)', () => {
  it('formulário vazio mostra "Campo obrigatório." e foca o Valor', async () => {
    const api = montar()
    const { dialogo, user } = await abrirForm()

    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    expect(within(dialogo).getAllByText('Campo obrigatório.').length).toBeGreaterThanOrEqual(4)
    expect(api.chamadasDe('POST /api/cartoes/1/compras')).toHaveLength(0)
    await waitFor(() => expect(within(dialogo).getByLabelText('Valor')).toHaveFocus())
  })

  it('com valor preenchido o foco vai para a Descrição', async () => {
    montar()
    const { dialogo, user } = await abrirForm()
    await user.type(within(dialogo).getByLabelText('Valor'), '1000')

    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(within(dialogo).getByLabelText('Descrição')).toHaveFocus())
  })

  it('com valor, descrição e categoria o foco vai para o Cartão', async () => {
    montar()
    const { dialogo, user } = await abrirForm()
    await user.type(within(dialogo).getByLabelText('Valor'), '1000')
    await user.type(within(dialogo).getByLabelText('Descrição'), 'Mercado')
    await user.selectOptions(within(dialogo).getByLabelText('Categoria'), 'Eletro')

    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(within(dialogo).getByLabelText('Cartão')).toHaveFocus())
    expect(within(dialogo).getByLabelText('Cartão')).toHaveAttribute('aria-invalid', 'true')
  })

  it('descrição só com espaços conta como vazia', async () => {
    const api = montar()
    const { dialogo, user } = await abrirForm()
    await preencherBasico(user, dialogo, '1000', '   ')

    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(within(dialogo).getByLabelText('Descrição')).toHaveFocus())
    expect(api.chamadasDe('POST /api/cartoes/1/compras')).toHaveLength(0)
  })

  it('erro do servidor em campo que não está na tela vira mensagem geral', async () => {
    montar({
      'POST /api/cartoes/1/compras': erroApi(422, 'VALIDACAO', 'Cartão inválido.', { cartao_id: 'Cartão inválido.' }),
    })
    const { dialogo, user } = await abrirForm()
    await preencherBasico(user, dialogo)
    await waitFor(() => expect(within(dialogo).getByLabelText('Fatura de destino')).toHaveValue('2026-10'))

    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Cartão inválido.')
  })
})

describe('edição de compra em série (CA-4.11, lado da tela)', () => {
  const parcela: ItemFaturaSaida = {
    id: 4,
    tipo: 'compra',
    valor: '200.00',
    data: '2026-09-20',
    descricao: 'Geladeira (4/6)',
    descricao_base: 'Geladeira',
    categoria: { id: 10, nome: 'Eletro', pai_nome: null, cor: '#112233', icone: 'tag' },
    tags: [],
    observacao: null,
    serie: { id: 3, tipo: 'parcelada', numero: 4, total: 6 },
    item_origem_id: null,
    fatura_mes: '2026-10',
    fatura_paga: false,
    criado_por: { id: 1, nome: 'Ana' },
  }

  function montarFatura() {
    return montar({
      'GET /api/cartoes/1/faturas/2026-10': json({
        ...resumo('2026-10', 'fechada'),
        valor: '200.00',
        bruto: '200.00',
        credito_recebido: '0.00',
        credito_repassado: '0.00',
        itens: [parcela],
        conta_arquivada: false,
        pode_pagar: true,
        editavel: true,
      }),
      'PATCH /api/itens-fatura/4': json(parcela),
    })
  }

  async function editarCom(rotuloAlcance: string) {
    const retorno = renderizarApp('/cartoes/1/faturas/2026-10')
    await retorno.user.click(await screen.findByRole('button', { name: 'Editar' }))
    await retorno.user.click(await screen.findByRole('button', { name: rotuloAlcance }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar despesa no cartão' })
    await waitFor(() => expect(within(dialogo).getByLabelText('Descrição')).toHaveValue('Geladeira'))
    await waitFor(() => expect(within(dialogo).getByLabelText('Cartão')).toHaveDisplayValue('Nubank'))
    return { ...retorno, dialogo }
  }

  it('parcelada com alcance múltiplo trava Valor, Data e Fatura, e o cartão não muda', async () => {
    montarFatura()
    const { dialogo } = await editarCom('Todas (incluindo efetivadas)')

    expect(within(dialogo).getByLabelText('Valor')).toBeDisabled()
    expect(within(dialogo).getByLabelText('Data')).toBeDisabled()
    expect(within(dialogo).getByLabelText('Fatura de destino')).toBeDisabled()
    expect(within(dialogo).getByLabelText('Cartão')).toBeDisabled()
    expect(within(dialogo).queryByRole('button', { name: 'Salvar e criar nova' })).not.toBeInTheDocument()
  })

  it('com alcance múltiplo envia só o que mudou', async () => {
    const api = montarFatura()
    const { dialogo, user } = await editarCom('Esta e as pendentes')

    await user.type(within(dialogo).getByLabelText('Descrição'), ' nova')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(api.chamadasDe('PATCH /api/itens-fatura/4')).toHaveLength(1))
    const chamada = api.chamadasDe('PATCH /api/itens-fatura/4')[0]
    expect(chamada?.params).toEqual({ alcance: 'este_e_pendentes' })
    expect(chamada?.corpo).toEqual({ descricao: 'Geladeira nova' })
  })

  it('"Somente esta" mantém Valor e Data editáveis', async () => {
    montarFatura()
    const { dialogo } = await editarCom('Somente esta')
    expect(within(dialogo).getByLabelText('Valor')).toBeEnabled()
    expect(within(dialogo).getByLabelText('Data')).toBeEnabled()
  })

  it('alcance múltiplo sem alteração fecha o formulário sem chamar o servidor', async () => {
    const api = montarFatura()
    const { dialogo, user } = await editarCom('Todas (incluindo efetivadas)')

    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.chamadasDe('PATCH /api/itens-fatura/4')).toHaveLength(0)
  })
})
