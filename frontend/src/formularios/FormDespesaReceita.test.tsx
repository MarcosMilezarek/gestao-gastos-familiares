import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { ContaSaida } from '../api/contas'
import type { ItemLancamentoLista, ListaControle } from '../api/controle'
import type { LancamentoSaida } from '../api/lancamentos'
import type { Sessao } from '../api/sessao'
import {
  erroApi,
  json,
  limparTudo,
  renderizarApp,
  simularApi,
  simularResizeObserver,
} from '../testes/utilitarios'

// Estacas de histórico: o BottomSheet chama history.back() ao desmontar (popstate assíncrono).
afterEach(async () => {
  limparTudo()
  await new Promise((r) => setTimeout(r, 10))
})

const conta = (id: number, nome: string, dono: number | null): ContaSaida => ({
  id,
  nome,
  instituicao: null,
  tipo: 'conta_corrente',
  cor: '#336699',
  saldo_inicial: '0.00',
  dono_usuario_id: dono,
  arquivado: false,
  casal_encerrado: false,
  saldo_atual: '0.00',
  saldo_previsto: '0.00',
})
const CONTAS = [conta(1, 'Conta Ana', 1), conta(2, 'Conta Conjunta', null), conta(3, 'Conta Bruno', 2)]

const categoria = (id: number, nome: string, tipo: 'despesa' | 'receita') => ({
  id,
  nome,
  tipo,
  icone: 'tag',
  cor: '#112233',
  fixa: false,
  arquivado: false,
  categoria_pai_id: null,
  subcategorias: [],
})
const CATEGORIAS = [categoria(10, 'Mercado', 'despesa'), categoria(20, 'Salário', 'receita')]
const TAGS = [
  { id: 1, nome: 'essencial' },
  { id: 2, nome: 'mercado' },
]

function lancamento(sobre: Partial<LancamentoSaida> = {}): LancamentoSaida {
  return {
    id: 100,
    tipo: 'despesa',
    valor: '50.00',
    data: '2026-10-15',
    situacao: 'confirmada',
    descricao: 'Padaria',
    categoria: { id: 10, nome: 'Mercado', pai_nome: null, cor: '#112233', icone: 'tag' },
    dono_usuario_id: 1,
    conta_id: 1,
    conta_destino_id: null,
    aporte: false,
    tags: [],
    observacao: null,
    criado_por: { id: 1, nome: 'Ana' },
    criado_em: '2026-10-01T10:00:00',
    recorrente: false,
    recorrencia_id: null,
    numero_recorrencia: null,
    total_ocorrencias: null,
    meta: null,
    ...sobre,
  }
}

function listaDe(lancs: LancamentoSaida[]): ListaControle {
  const datas = [...new Set(lancs.map((l) => l.data))].sort()
  return {
    mes: '2026-10',
    filtros_ativos: false,
    resumo: {
      entradas: { previsto: '0.00', realizado: '0.00' },
      saidas: { previsto: '0.00', realizado: '0.00' },
      saldo: { previsto: '0.00', realizado: '0.00' },
      saldo_atual_total: '0.00',
    },
    dias: datas.map((data) => ({
      data,
      saldo_fim_do_dia: '0.00',
      itens: lancs
        .filter((l) => l.data === data)
        .map(
          (l): ItemLancamentoLista => ({
            kind: 'lancamento',
            lancamento: l,
            conta_nome: CONTAS.find((c) => c.id === l.conta_id)?.nome ?? null,
            conta_destino_nome: null,
            rotulo: l.tipo === 'receita' ? 'Receita' : 'Despesa',
            meta: null,
          }),
        ),
    })),
  }
}

// API simulada com um "banco" mínimo: POST acrescenta à lista que o GET devolve.
function montar(inicial: LancamentoSaida[] = [], sessao?: Sessao) {
  simularResizeObserver()
  const banco = [...inicial]
  let proximoId = 500
  const api = simularApi({
    'GET /api/contas': json({ mes: '2026-10', contas: CONTAS, total_saldo_atual: null, total_saldo_previsto: null }),
    'GET /api/categorias': ({ params }) =>
      json(CATEGORIAS.filter((c) => !params.tipo || c.tipo === params.tipo)),
    'GET /api/tags': json(TAGS),
    'GET /api/controle/lista': () => json(listaDe(banco)),
    'POST /api/lancamentos': ({ corpo }) => {
      const c = corpo as Record<string, unknown>
      const criado = lancamento({
        id: proximoId++,
        tipo: c.tipo as 'despesa' | 'receita',
        valor: c.valor as string,
        data: c.data as string,
        descricao: c.descricao as string,
        situacao: (c.situacao as 'confirmada' | 'prevista') ?? 'prevista',
        tags: TAGS.filter((t) => (c.tag_ids as number[]).includes(t.id)),
        observacao: (c.observacao as string) || null,
      })
      banco.push(criado)
      return json(criado, 201)
    },
  }, sessao ? { sessao } : {})
  return { api, banco }
}

async function abrirMenu(user: ReturnType<typeof renderizarApp>['user']) {
  await screen.findByRole('heading', { name: 'Controle' })
  await user.click(screen.getByRole('button', { name: 'Novo lançamento' }))
}

async function abrirForm(user: ReturnType<typeof renderizarApp>['user'], opcao: string, titulo: string) {
  await abrirMenu(user)
  await user.click(await screen.findByRole('button', { name: opcao }))
  const dialogo = await screen.findByRole('dialog', { name: titulo })
  // A conta do dono entra depois de /api/contas responder.
  if (opcao === 'Despesa' || opcao === 'Receita') {
    await waitFor(() => expect(screen.getByLabelText('Conta')).toHaveDisplayValue('Conta Ana'))
  }
  return dialogo
}

describe('menu "+" (CA-0.02)', () => {
  it('abre um menu com exatamente 4 opções', async () => {
    montar()
    const { user } = renderizarApp('/controle')
    await abrirMenu(user)
    const menu = await screen.findByRole('dialog', { name: 'Novo lançamento' })
    expect(within(menu).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Despesa',
      'Receita',
      'Despesa no cartão',
      'Aporte/Transferência',
    ])
  })

  it.each([
    ['Despesa', 'Nova despesa'],
    ['Receita', 'Nova receita'],
    ['Despesa no cartão', 'Nova despesa no cartão'],
    ['Aporte/Transferência', 'Nova transferência'],
  ])('a opção "%s" fecha o menu e abre o formulário "%s"', async (opcao, titulo) => {
    montar()
    const { user } = renderizarApp('/controle')
    await abrirMenu(user)
    await user.click(await screen.findByRole('button', { name: opcao }))
    expect(await screen.findByRole('dialog', { name: titulo })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Novo lançamento' })).not.toBeInTheDocument()
  })
})

describe('"Mais detalhes" (CA-0.05)', () => {
  it('abre com tags, observação e recorrência escondidas e os mostra ao tocar', async () => {
    montar()
    const { user } = renderizarApp('/controle')
    const dialogo = await abrirForm(user, 'Despesa', 'Nova despesa')
    expect(within(dialogo).queryByText('Tags')).not.toBeInTheDocument()
    expect(within(dialogo).queryByLabelText('Observação')).not.toBeInTheDocument()
    expect(within(dialogo).queryByRole('switch', { name: 'Recorrente' })).not.toBeInTheDocument()
    const botao = screen.getByRole('button', { name: 'Mais detalhes' })
    expect(botao).toHaveAttribute('aria-expanded', 'false')

    await user.click(botao)

    expect(botao).toHaveAttribute('aria-expanded', 'true')
    expect(within(dialogo).getByText('Tags')).toBeInTheDocument()
    expect(within(dialogo).getByLabelText('Observação')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Recorrente' })).toBeInTheDocument()
  })
})

describe('criar despesa (CA-2.12, CA-0.06)', () => {
  it('salva R$ 120,50 em Mercado e a mostra na lista do mês', async () => {
    const { api } = montar()
    const { user } = renderizarApp('/controle')
    await abrirForm(user, 'Despesa', 'Nova despesa')
    await user.type(screen.getByLabelText('Valor'), '12050')
    expect(screen.getByLabelText('Valor')).toHaveValue('120,50')
    await user.type(screen.getByLabelText('Descrição'), 'Feira')
    await user.selectOptions(screen.getByLabelText('Categoria'), 'Mercado')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(api.chamadasDe('POST /api/lancamentos')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/lancamentos')[0]?.corpo).toEqual({
      tipo: 'despesa',
      valor: '120.50',
      data: '2026-10-15',
      descricao: 'Feira',
      categoria_id: 10,
      dono_usuario_id: 1,
      conta_id: 1,
      tag_ids: [],
      observacao: '',
      situacao: 'confirmada',
    })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova despesa' })).not.toBeInTheDocument())
    expect(await screen.findByText('Feira')).toBeInTheDocument()
  })

  it('recusa valor zero devolvido pela API e mantém o formulário aberto com o erro no campo', async () => {
    simularResizeObserver()
    simularApi({
      'GET /api/contas': json({ mes: '2026-10', contas: CONTAS, total_saldo_atual: null, total_saldo_previsto: null }),
      'GET /api/categorias': json(CATEGORIAS),
      'GET /api/tags': json(TAGS),
      'GET /api/controle/lista': json(listaDe([])),
      'POST /api/lancamentos': erroApi(422, 'VALIDACAO', 'Dados inválidos.', { valor: 'O valor deve ser maior que zero.' }),
    })
    const { user } = renderizarApp('/controle')
    await abrirForm(user, 'Despesa', 'Nova despesa')
    await user.type(screen.getByLabelText('Valor'), '0')
    await user.type(screen.getByLabelText('Descrição'), 'Nada')
    await user.selectOptions(screen.getByLabelText('Categoria'), 'Mercado')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText('O valor deve ser maior que zero.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Nova despesa' })).toBeInTheDocument()
    expect(screen.getByLabelText('Valor')).toHaveAttribute('aria-invalid', 'true')
  })

  it('sem valor, descrição e categoria, mostra "Campo obrigatório." e não chama a API', async () => {
    const { api } = montar()
    const { user } = renderizarApp('/controle')
    await abrirForm(user, 'Despesa', 'Nova despesa')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findAllByText('Campo obrigatório.')).toHaveLength(3)
    expect(api.chamadasDe('POST /api/lancamentos')).toHaveLength(0)
  })

  it('"Salvar e criar nova" lista o lançamento e reabre o formulário vazio com os padrões de abertura', async () => {
    const { api } = montar()
    const { user } = renderizarApp('/controle')
    await abrirForm(user, 'Despesa', 'Nova despesa')
    await user.type(screen.getByLabelText('Valor'), '3000')
    await user.type(screen.getByLabelText('Descrição'), 'Pão')
    await user.selectOptions(screen.getByLabelText('Categoria'), 'Mercado')
    await user.selectOptions(screen.getByLabelText('Dono'), 'Casal')
    await user.click(screen.getByRole('button', { name: 'Mais detalhes' }))
    await user.type(screen.getByLabelText('Observação'), 'quente')
    await user.click(screen.getByRole('button', { name: 'Salvar e criar nova' }))

    await waitFor(() => expect(api.chamadasDe('POST /api/lancamentos')).toHaveLength(1))
    expect(await screen.findByText('Pão')).toBeInTheDocument()
    const dialogo = screen.getByRole('dialog', { name: 'Nova despesa' })
    await waitFor(() => expect(within(dialogo).getByLabelText('Descrição')).toHaveValue(''))
    expect(within(dialogo).getByLabelText('Valor')).toHaveValue('')
    expect(within(dialogo).getByLabelText('Categoria')).toHaveValue('')
    expect(within(dialogo).getByLabelText('Observação')).toHaveValue('')
    // Padrões de abertura: dono = pessoa logada, data = hoje, conta do dono.
    expect(within(dialogo).getByLabelText('Dono')).toHaveDisplayValue('Ana')
    expect(within(dialogo).getByLabelText('Data')).toHaveValue('2026-10-15')
    await waitFor(() => expect(within(dialogo).getByLabelText('Conta')).toHaveDisplayValue('Conta Ana'))
    expect(within(dialogo).getByLabelText('Foi paga')).toBeChecked()
  })

  it('os atalhos Hoje e Ontem preenchem a data', async () => {
    montar()
    const { user } = renderizarApp('/controle')
    await abrirForm(user, 'Despesa', 'Nova despesa')
    await user.click(screen.getByRole('button', { name: 'Ontem' }))
    expect(screen.getByLabelText('Data')).toHaveValue('2026-10-14')
    await user.click(screen.getByRole('button', { name: 'Hoje' }))
    expect(screen.getByLabelText('Data')).toHaveValue('2026-10-15')
  })

  it('Ontem na virada do mês e do ano usa o último dia do mês anterior', async () => {
    const sessao: Sessao = {
      usuario: { id: 1, nome: 'Ana', email: 'ana@exemplo.com', tema: 'claro' },
      hoje: '2027-01-01',
      casal: { id: 1, parceiro: { id: 2, nome: 'Bruno' } },
    }
    montar([], sessao)
    const { user } = renderizarApp('/controle', { sessao })
    await abrirForm(user, 'Despesa', 'Nova despesa')
    await user.click(screen.getByRole('button', { name: 'Ontem' }))
    expect(screen.getByLabelText('Data')).toHaveValue('2026-12-31')
  })
})

describe('receita', () => {
  it('abre com a categoria de receita e envia tipo "receita"', async () => {
    const { api } = montar()
    const { user } = renderizarApp('/controle')
    await abrirForm(user, 'Receita', 'Nova receita')
    expect(screen.getByLabelText('Foi recebida')).toBeChecked()
    await user.type(screen.getByLabelText('Valor'), '300000')
    await user.type(screen.getByLabelText('Descrição'), 'Salário')
    await user.selectOptions(screen.getByLabelText('Categoria'), 'Salário')
    expect(screen.queryByRole('option', { name: 'Mercado' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(api.chamadasDe('POST /api/lancamentos')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/lancamentos')[0]?.corpo).toMatchObject({
      tipo: 'receita',
      valor: '3000.00',
      categoria_id: 20,
    })
  })
})

describe('tags e observação (CA-2.13)', () => {
  it('envia as tags e a observação marcadas', async () => {
    const { api } = montar()
    const { user } = renderizarApp('/controle')
    await abrirForm(user, 'Despesa', 'Nova despesa')
    await user.type(screen.getByLabelText('Valor'), '1000')
    await user.type(screen.getByLabelText('Descrição'), 'Compra')
    await user.selectOptions(screen.getByLabelText('Categoria'), 'Mercado')
    await user.click(screen.getByRole('button', { name: 'Mais detalhes' }))
    await user.click(await screen.findByLabelText('essencial'))
    await user.click(screen.getByLabelText('mercado'))
    await user.type(screen.getByLabelText('Observação'), 'Compra do mês')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(api.chamadasDe('POST /api/lancamentos')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/lancamentos')[0]?.corpo).toMatchObject({
      tag_ids: [1, 2],
      observacao: 'Compra do mês',
    })
  })

  it('ao reabrir para editar, mostra tags e observação salvas e o bloco já aberto', async () => {
    montar([
      lancamento({
        tags: TAGS,
        observacao: 'Compra do mês',
        descricao: 'Mercado do mês',
      }),
    ])
    const { user } = renderizarApp('/controle')
    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    await screen.findByRole('dialog', { name: 'Editar despesa' })
    expect(screen.getByLabelText('Observação')).toHaveValue('Compra do mês')
    expect(screen.getByLabelText('essencial')).toBeChecked()
    expect(screen.getByLabelText('mercado')).toBeChecked()
  })

  it('lançamento sem tags nem observação é aceito', async () => {
    const { api } = montar()
    const { user } = renderizarApp('/controle')
    await abrirForm(user, 'Despesa', 'Nova despesa')
    await user.type(screen.getByLabelText('Valor'), '1000')
    await user.type(screen.getByLabelText('Descrição'), 'Simples')
    await user.selectOptions(screen.getByLabelText('Categoria'), 'Mercado')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.chamadasDe('POST /api/lancamentos')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/lancamentos')[0]?.corpo).toMatchObject({ tag_ids: [], observacao: '' })
  })
})

describe('dono e conta (CA-2.14)', () => {
  it('dono Casal fixa a conta conjunta e ela não pode ser alterada', async () => {
    const { api } = montar()
    const { user } = renderizarApp('/controle')
    await abrirForm(user, 'Despesa', 'Nova despesa')
    await user.selectOptions(screen.getByLabelText('Dono'), 'Casal')
    expect(screen.getByLabelText('Conta')).toHaveDisplayValue('Conta Conjunta')
    expect(screen.getByLabelText('Conta')).toBeDisabled()

    await user.type(screen.getByLabelText('Valor'), '1000')
    await user.type(screen.getByLabelText('Descrição'), 'Luz')
    await user.selectOptions(screen.getByLabelText('Categoria'), 'Mercado')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.chamadasDe('POST /api/lancamentos')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/lancamentos')[0]?.corpo).toMatchObject({
      dono_usuario_id: null,
      conta_id: 2,
    })
  })

  it('dono Ana seleciona a conta individual dela e dono Bruno, a dele; o dono não oferece conta alheia', async () => {
    montar()
    const { user } = renderizarApp('/controle')
    await abrirForm(user, 'Despesa', 'Nova despesa')
    expect(screen.getByLabelText('Conta')).toBeDisabled()
    expect(within(screen.getByLabelText('Conta')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Conta Ana'])
    await user.selectOptions(screen.getByLabelText('Dono'), 'Bruno')
    expect(screen.getByLabelText('Conta')).toHaveDisplayValue('Conta Bruno')
    expect(within(screen.getByLabelText('Conta')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Conta Bruno'])
  })

  it('dono e conta que a API recusa mostram a mensagem sem fechar o formulário', async () => {
    simularResizeObserver()
    simularApi({
      'GET /api/contas': json({ mes: '2026-10', contas: CONTAS, total_saldo_atual: null, total_saldo_previsto: null }),
      'GET /api/categorias': json(CATEGORIAS),
      'GET /api/tags': json(TAGS),
      'GET /api/controle/lista': json(listaDe([])),
      'POST /api/lancamentos': erroApi(422, 'CONTA_DE_OUTRO_DONO', 'A conta não pertence ao dono escolhido.'),
    })
    const { user } = renderizarApp('/controle')
    await abrirForm(user, 'Despesa', 'Nova despesa')
    await user.type(screen.getByLabelText('Valor'), '1000')
    await user.type(screen.getByLabelText('Descrição'), 'X')
    await user.selectOptions(screen.getByLabelText('Categoria'), 'Mercado')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('A conta não pertence ao dono escolhido.')
    expect(screen.getByRole('dialog', { name: 'Nova despesa' })).toBeInTheDocument()
  })
})

describe('situação (CA-2.15)', () => {
  it('data de hoje ou passada abre confirmada; data futura, prevista', async () => {
    montar()
    const { user } = renderizarApp('/controle')
    await abrirForm(user, 'Despesa', 'Nova despesa')
    expect(screen.getByLabelText('Foi paga')).toBeChecked()
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-10-20' } })
    expect(screen.getByLabelText('Foi paga')).not.toBeChecked()
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-10-10' } })
    expect(screen.getByLabelText('Foi paga')).toBeChecked()
  })

  it('a escolha manual é respeitada ao salvar', async () => {
    const { api } = montar()
    const { user } = renderizarApp('/controle')
    await abrirForm(user, 'Despesa', 'Nova despesa')
    await user.click(screen.getByLabelText('Foi paga'))
    await user.type(screen.getByLabelText('Valor'), '1000')
    await user.type(screen.getByLabelText('Descrição'), 'Manual')
    await user.selectOptions(screen.getByLabelText('Categoria'), 'Mercado')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.chamadasDe('POST /api/lancamentos')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/lancamentos')[0]?.corpo).toMatchObject({ data: '2026-10-15', situacao: 'prevista' })
  })
})

describe('confirmar e atrasada (CA-2.16, CA-2.17)', () => {
  it('confirmar receita prevista de R$ 3.000,00 com valor real R$ 3.150,00 envia o valor real e atualiza a lista', async () => {
    const receita = lancamento({
      id: 7,
      tipo: 'receita',
      valor: '3000.00',
      situacao: 'prevista',
      descricao: 'Salário',
      data: '2026-10-20',
    })
    const banco = [receita]
    simularResizeObserver()
    const api = simularApi({
      'GET /api/contas': json({ mes: '2026-10', contas: CONTAS, total_saldo_atual: null, total_saldo_previsto: null }),
      'GET /api/categorias': json(CATEGORIAS),
      'GET /api/tags': json(TAGS),
      'GET /api/controle/lista': () => json(listaDe(banco)),
      'POST /api/lancamentos/7/confirmar': ({ corpo }) => {
        banco[0] = { ...receita, situacao: 'confirmada', valor: (corpo as { valor: string }).valor }
        return json(banco[0])
      },
    })
    const { user } = renderizarApp('/controle')
    expect(await screen.findByText('Prevista')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    const campo = await screen.findByLabelText('Valor real')
    expect(campo).toHaveValue('3.000,00')
    await user.clear(campo)
    await user.type(campo, '315000')
    await user.click(within(screen.getByRole('dialog', { name: 'Confirmar lançamento' })).getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(api.chamadasDe('POST /api/lancamentos/7/confirmar')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/lancamentos/7/confirmar')[0]?.corpo).toEqual({ valor: '3150.00' })
    expect(await screen.findByText('Confirmada')).toBeInTheDocument()
    expect(screen.queryByText('Prevista')).not.toBeInTheDocument()
    expect((await screen.findAllByText(/3\.150,00/)).length).toBeGreaterThan(0)
  })

  it('despesa atrasada mostra "Atrasada"; prevista de amanhã mostra só "Prevista"; confirmar a atrasada tira a marca', async () => {
    const atrasada = lancamento({ id: 8, situacao: 'atrasada', descricao: 'Ontem', data: '2026-10-14' })
    const amanha = lancamento({ id: 9, situacao: 'prevista', descricao: 'Amanhã', data: '2026-10-16' })
    const banco = [atrasada, amanha]
    simularResizeObserver()
    simularApi({
      'GET /api/contas': json({ mes: '2026-10', contas: CONTAS, total_saldo_atual: null, total_saldo_previsto: null }),
      'GET /api/categorias': json(CATEGORIAS),
      'GET /api/tags': json(TAGS),
      'GET /api/controle/lista': () => json(listaDe(banco)),
      'POST /api/lancamentos/8/confirmar': () => {
        banco[0] = { ...atrasada, situacao: 'confirmada' }
        return json(banco[0])
      },
    })
    const { user } = renderizarApp('/controle')
    await screen.findByText('Atrasada')
    const itemAmanha = screen.getByText('Amanhã').closest('li') as HTMLElement
    expect(within(itemAmanha).getByText('Prevista')).toBeInTheDocument()
    expect(within(itemAmanha).queryByText('Atrasada')).not.toBeInTheDocument()

    const itemOntem = screen.getByText('Ontem').closest('li') as HTMLElement
    await user.click(within(itemOntem).getByRole('button', { name: 'Confirmar' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Confirmar lançamento' })).getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(screen.queryByText('Atrasada')).not.toBeInTheDocument())
  })
})

describe('recorrência na criação (CA-3.01, lado do formulário)', () => {
  it('recorrente mensal sem fim envia recorrencia e não envia situacao; esconde "Foi paga"', async () => {
    const { api } = montar()
    const { user } = renderizarApp('/controle')
    await abrirForm(user, 'Despesa', 'Nova despesa')
    await user.click(screen.getByRole('button', { name: 'Mais detalhes' }))
    await user.click(screen.getByRole('switch', { name: 'Recorrente' }))
    expect(screen.queryByLabelText('Foi paga')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Valor'), '150000')
    await user.type(screen.getByLabelText('Descrição'), 'Aluguel')
    await user.selectOptions(screen.getByLabelText('Categoria'), 'Mercado')
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-10-10' } })
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(api.chamadasDe('POST /api/lancamentos')).toHaveLength(1))
    const corpo = api.chamadasDe('POST /api/lancamentos')[0]?.corpo as Record<string, unknown>
    expect(corpo).toMatchObject({
      tipo: 'despesa',
      valor: '1500.00',
      data: '2026-10-10',
      descricao: 'Aluguel',
      recorrencia: { modo: 'sem_fim' },
    })
    expect(corpo).not.toHaveProperty('situacao')
  })

  it('"Repetir N meses" envia o número de meses como inteiro', async () => {
    const { api } = montar()
    const { user } = renderizarApp('/controle')
    await abrirForm(user, 'Despesa', 'Nova despesa')
    await user.click(screen.getByRole('button', { name: 'Mais detalhes' }))
    await user.click(screen.getByRole('switch', { name: 'Recorrente' }))
    await user.click(screen.getByLabelText('Repetir N meses'))
    await user.type(screen.getByLabelText('Número de meses'), '12')
    await user.type(screen.getByLabelText('Valor'), '1000')
    await user.type(screen.getByLabelText('Descrição'), 'Parcelado')
    await user.selectOptions(screen.getByLabelText('Categoria'), 'Mercado')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.chamadasDe('POST /api/lancamentos')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/lancamentos')[0]?.corpo).toMatchObject({
      recorrencia: { modo: 'n_meses', meses: 12 },
    })
  })

  it('com a recorrência ligada o bloco "Mais detalhes" fica aberto e sem poder recolher', async () => {
    montar()
    const { user } = renderizarApp('/controle')
    await abrirForm(user, 'Despesa', 'Nova despesa')
    await user.click(screen.getByRole('button', { name: 'Mais detalhes' }))
    await user.click(screen.getByRole('switch', { name: 'Recorrente' }))
    expect(screen.getByRole('button', { name: 'Mais detalhes' })).toBeDisabled()
    expect(screen.getByLabelText('Observação')).toBeInTheDocument()
  })
})

describe('valor monetário (CA-N.02)', () => {
  it('0,10 + 0,20: o campo aceita os dois valores e envia "0.10" e "0.20" como texto; soma exibida pela API é 0,30', async () => {
    const { api, banco } = montar()
    const { user } = renderizarApp('/controle')
    await abrirForm(user, 'Despesa', 'Nova despesa')

    for (const [digitos, mascara, descricao] of [
      ['10', '0,10', 'Dez'],
      ['20', '0,20', 'Vinte'],
    ] as const) {
      await user.type(screen.getByLabelText('Valor'), digitos)
      expect(screen.getByLabelText('Valor')).toHaveValue(mascara)
      await user.type(screen.getByLabelText('Descrição'), descricao)
      await user.selectOptions(screen.getByLabelText('Categoria'), 'Mercado')
      await user.click(screen.getByRole('button', { name: 'Salvar e criar nova' }))
      await waitFor(() => expect(banco.some((l) => l.descricao === descricao)).toBe(true))
      await waitFor(() => expect(screen.getByLabelText('Descrição')).toHaveValue(''))
    }

    expect(api.chamadasDe('POST /api/lancamentos').map((c) => (c.corpo as { valor: string }).valor)).toEqual([
      '0.10',
      '0.20',
    ])
  })

  it.each([
    ['Despesa', 'Nova despesa'],
    ['Receita', 'Nova receita'],
    ['Despesa no cartão', 'Nova despesa no cartão'],
    ['Aporte/Transferência', 'Nova transferência'],
  ])('o formulário "%s" não tem seletor de moeda', async (opcao, titulo) => {
    montar()
    const { user } = renderizarApp('/controle')
    const dialogo = await abrirForm(user, opcao, titulo)
    expect(within(dialogo).queryByLabelText(/moeda/i)).not.toBeInTheDocument()
    expect(within(dialogo).queryByText(/moeda/i)).not.toBeInTheDocument()
    expect(within(dialogo).queryByRole('option', { name: /BRL|USD|EUR|real|dólar/i })).not.toBeInTheDocument()
  })
})
