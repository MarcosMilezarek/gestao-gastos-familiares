import { afterEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { ContaSaida } from '../api/contas'
import type { ItemLancamentoLista, ListaControle } from '../api/controle'
import type { InicioSaida } from '../api/inicio'
import type { LancamentoSaida } from '../api/lancamentos'
import type { ProporcaoSaida } from '../api/proporcao'
import {
  erroApi,
  json,
  limparTudo,
  renderizarApp,
  simularApi,
  simularResizeObserver,
  type Resposta,
} from '../testes/utilitarios'

// O BottomSheet chama history.back() ao desmontar (popstate assíncrono).
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
const LISTA_CONTAS = json({ mes: '2026-10', contas: CONTAS, total_saldo_atual: null, total_saldo_previsto: null })

const PROPORCAO: ProporcaoSaida = {
  mes: '2026-10',
  base_despesas_casal: '1000.00',
  origem_porcentagem: 'mes',
  mes_origem: null,
  pessoas: [
    { usuario_id: 1, nome: 'Ana', porcentagem: '60.00', devido: '600.00', aportado: '100.00', faltante: '500.00', excedente: '0.00' },
    { usuario_id: 2, nome: 'Bruno', porcentagem: '40.00', devido: '400.00', aportado: '450.00', faltante: '0.00', excedente: '50.00' },
  ],
}

const INICIO: InicioSaida = {
  mes: '2026-10',
  hoje: '2026-10-15',
  cards: {
    saldos: CONTAS.map((c) => ({
      conta_id: c.id,
      nome: c.nome,
      dono_usuario_id: c.dono_usuario_id,
      saldo_atual: '0.00',
    })),
    total_faturas_mes: '0.00',
  },
  proporcao: PROPORCAO,
  pendentes: [],
  despesas_por_categoria: { mes: '2026-10', total: '0.00', categorias: [] },
  balanco_contas: [],
  proximas_faturas: [],
  projecao: { conta_id: null, horizonte: 6, meses: [] },
}

const TRANSFERENCIA: LancamentoSaida = {
  id: 700,
  tipo: 'transferencia',
  valor: '70.00',
  data: '2026-10-10',
  situacao: 'confirmada',
  descricao: 'Aporte antigo',
  categoria: null,
  dono_usuario_id: 2,
  conta_id: 3,
  conta_destino_id: 2,
  aporte: true,
  tags: [],
  observacao: null,
  criado_por: { id: 2, nome: 'Bruno' },
  criado_em: '2026-10-01T10:00:00',
  recorrente: false,
  recorrencia_id: null,
  numero_recorrencia: null,
  total_ocorrencias: null,
  meta: null,
}

function listaCom(lancs: LancamentoSaida[]): ListaControle {
  return {
    mes: '2026-10',
    filtros_ativos: false,
    resumo: {
      entradas: { previsto: '0.00', realizado: '0.00' },
      saidas: { previsto: '0.00', realizado: '0.00' },
      saldo: { previsto: '0.00', realizado: '0.00' },
      saldo_atual_total: '0.00',
    },
    dias: lancs.map((l) => ({
      data: l.data,
      saldo_fim_do_dia: '0.00',
      itens: [
        {
          kind: 'lancamento',
          lancamento: l,
          conta_nome: 'Conta Bruno',
          conta_destino_nome: 'Conta Conjunta',
          rotulo: 'Transferência',
          meta: null,
        } satisfies ItemLancamentoLista,
      ],
    })),
  }
}

type Sugestao = Resposta | ((params: Record<string, string>) => Resposta | Promise<Resposta>)

function montar(sugestao: Sugestao = json({ valor: '500.00' })) {
  simularResizeObserver()
  return simularApi({
    'GET /api/contas': LISTA_CONTAS,
    'GET /api/tags': json([]),
    'GET /api/inicio': json(INICIO),
    'GET /api/controle/lista': json(listaCom([TRANSFERENCIA])),
    'GET /api/proporcao': json(PROPORCAO),
    'GET /api/proporcao/sugestao-aporte': ({ params }) =>
      typeof sugestao === 'function' ? sugestao(params) : sugestao,
    'POST /api/lancamentos': ({ corpo }) => json({ ...TRANSFERENCIA, ...(corpo as object), id: 800 }, 201),
    'PATCH /api/lancamentos/700': json(TRANSFERENCIA),
  })
}

type Usuario = ReturnType<typeof renderizarApp>['user']

// Aporte de Ana: botão "Fazer aporte" no card dela, no Início.
async function abrirAporteDaAna(user: Usuario) {
  await screen.findByRole('heading', { level: 2, name: 'Ana' })
  const card = screen.getByRole('heading', { level: 2, name: 'Ana' }).closest('section') as HTMLElement
  await user.click(within(card).getByRole('button', { name: 'Fazer aporte' }))
  return screen.findByRole('dialog', { name: 'Nova transferência' })
}

async function abrirTransferenciaLivre(user: Usuario) {
  await screen.findByRole('heading', { name: 'Controle' })
  await user.click(screen.getByRole('button', { name: 'Novo lançamento' }))
  await user.click(await screen.findByRole('button', { name: 'Aporte/Transferência' }))
  return screen.findByRole('dialog', { name: 'Nova transferência' })
}

describe('"Fazer aporte" abre a transferência preenchida (CA-5.16, CA-3.19)', () => {
  it('preenche origem na conta de Ana, destino na conjunta, data de hoje e valor igual ao faltante', async () => {
    const api = montar()
    const { user } = renderizarApp('/')
    const dialogo = await abrirAporteDaAna(user)

    expect(within(dialogo).getByLabelText('Conta de origem')).toHaveDisplayValue('Conta Ana')
    expect(within(dialogo).getByLabelText('Conta de destino')).toHaveDisplayValue('Conta Conjunta')
    expect(within(dialogo).getByLabelText('Data')).toHaveValue('2026-10-15')
    await waitFor(() => expect(within(dialogo).getByLabelText('Valor')).toHaveValue('500,00'))
    expect(api.chamadasDe('GET /api/proporcao/sugestao-aporte')[0]?.params).toEqual({
      conta_origem_id: '1',
      data: '2026-10-15',
    })
  })

  it('permite alterar o valor sugerido para R$ 450,00 e grava o aporte com o valor alterado', async () => {
    const api = montar()
    const { user } = renderizarApp('/')
    const dialogo = await abrirAporteDaAna(user)
    const valor = within(dialogo).getByLabelText('Valor')
    await waitFor(() => expect(valor).toHaveValue('500,00'))

    await user.clear(valor)
    await user.type(valor, '45000')
    expect(valor).toHaveValue('450,00')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(api.chamadasDe('POST /api/lancamentos')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/lancamentos')[0]?.corpo).toMatchObject({
      tipo: 'transferencia',
      valor: '450.00',
      conta_id: 1,
      conta_destino_id: 2,
      data: '2026-10-15',
    })
  })

  it('sem alterar, grava o valor sugerido (igual ao faltante)', async () => {
    const api = montar()
    const { user } = renderizarApp('/')
    const dialogo = await abrirAporteDaAna(user)
    await waitFor(() => expect(within(dialogo).getByLabelText('Valor')).toHaveValue('500,00'))

    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(api.chamadasDe('POST /api/lancamentos')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/lancamentos')[0]?.corpo).toMatchObject({ valor: '500.00', conta_id: 1, conta_destino_id: 2 })
  })

  it('sem faltante (sugestão nula) o campo de valor vem vazio', async () => {
    const api = montar(json({ valor: null }))
    const { user } = renderizarApp('/')
    const dialogo = await abrirAporteDaAna(user)

    await waitFor(() => expect(api.chamadasDe('GET /api/proporcao/sugestao-aporte')).toHaveLength(1))
    expect(within(dialogo).getByLabelText('Valor')).toHaveValue('')
  })
})

describe('sugestão de aporte na transferência (CA-3.19)', () => {
  it('escolher origem individual e destino conjunta no formulário livre sugere o faltante', async () => {
    const api = montar()
    const { user } = renderizarApp('/controle')
    const dialogo = await abrirTransferenciaLivre(user)
    expect(api.chamadasDe('GET /api/proporcao/sugestao-aporte')).toHaveLength(0)
    await within(within(dialogo).getByLabelText('Conta de origem')).findByRole('option', { name: 'Conta Ana' })

    await user.selectOptions(within(dialogo).getByLabelText('Conta de origem'), 'Conta Ana')
    expect(api.chamadasDe('GET /api/proporcao/sugestao-aporte')).toHaveLength(0)
    await user.selectOptions(within(dialogo).getByLabelText('Conta de destino'), 'Conta Conjunta')

    await waitFor(() => expect(within(dialogo).getByLabelText('Valor')).toHaveValue('500,00'))
  })

  it('transferência entre contas individuais não consulta a sugestão', async () => {
    const api = montar()
    const { user } = renderizarApp('/controle')
    const dialogo = await abrirTransferenciaLivre(user)
    await within(within(dialogo).getByLabelText('Conta de origem')).findByRole('option', { name: 'Conta Bruno' })

    await user.selectOptions(within(dialogo).getByLabelText('Conta de origem'), 'Conta Ana')
    await user.selectOptions(within(dialogo).getByLabelText('Conta de destino'), 'Conta Bruno')

    expect(within(dialogo).getByLabelText('Valor')).toHaveValue('')
    expect(api.chamadasDe('GET /api/proporcao/sugestao-aporte')).toHaveLength(0)
  })

  it('422 na sugestão (data fora do intervalo) vira "sem sugestão": campo livre, sem mensagem de erro e sem repetir', async () => {
    const api = montar(erroApi(422, 'DATA_FORA_DO_INTERVALO', 'Data fora do intervalo.'))
    const { user } = renderizarApp('/')
    const dialogo = await abrirAporteDaAna(user)

    await waitFor(() => expect(api.chamadasDe('GET /api/proporcao/sugestao-aporte')).toHaveLength(1))
    // O 422 chega e o formulário continua utilizável.
    await new Promise((r) => setTimeout(r, 50))
    const valor = within(dialogo).getByLabelText('Valor')
    expect(valor).toHaveValue('')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Data fora do intervalo.')).not.toBeInTheDocument()

    await user.type(valor, '12300')
    expect(valor).toHaveValue('123,00')
    expect(api.chamadasDe('GET /api/proporcao/sugestao-aporte')).toHaveLength(1)
  })

  it('digitar antes da sugestão chegar: o valor digitado não é sobrescrito quando ela chega', async () => {
    let liberar: (r: Resposta) => void = () => {}
    const api = montar(() => new Promise<Resposta>((resolve) => (liberar = resolve)))
    const { user } = renderizarApp('/')
    const dialogo = await abrirAporteDaAna(user)
    await waitFor(() => expect(api.chamadasDe('GET /api/proporcao/sugestao-aporte')).toHaveLength(1))
    const valor = within(dialogo).getByLabelText('Valor')

    await user.type(valor, '450')
    expect(valor).toHaveValue('4,50')
    liberar(json({ valor: '500.00' }))
    await new Promise((r) => setTimeout(r, 50))

    expect(valor).toHaveValue('4,50')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.chamadasDe('POST /api/lancamentos')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/lancamentos')[0]?.corpo).toMatchObject({ valor: '4.50' })
  })

  it('trocar a data antes de digitar busca a sugestão do novo mês', async () => {
    const api = montar(({ data }) => json({ valor: data?.startsWith('2026-09') ? '120.00' : '500.00' }))
    const { user } = renderizarApp('/')
    const dialogo = await abrirAporteDaAna(user)
    await waitFor(() => expect(within(dialogo).getByLabelText('Valor')).toHaveValue('500,00'))

    const data = within(dialogo).getByLabelText('Data')
    await user.clear(data)
    await user.type(data, '2026-09-20')

    await waitFor(() => expect(within(dialogo).getByLabelText('Valor')).toHaveValue('120,00'))
    expect(api.chamadasDe('GET /api/proporcao/sugestao-aporte').at(-1)?.params.data).toBe('2026-09-20')
  })
})

describe('edição de transferência existente', () => {
  it('abre com os valores do lançamento, sem preenchimento de aporte e sem consultar a sugestão', async () => {
    const api = montar()
    const { user } = renderizarApp('/controle')
    await screen.findByText('Aporte antigo')
    const linha = screen.getByText('Aporte antigo').closest('li') as HTMLElement
    await user.click(within(linha).getByRole('button', { name: 'Editar' }))

    const dialogo = await screen.findByRole('dialog', { name: 'Editar transferência' })
    await waitFor(() => expect(within(dialogo).getByLabelText('Conta de origem')).toHaveDisplayValue('Conta Bruno'))
    expect(within(dialogo).getByLabelText('Conta de destino')).toHaveDisplayValue('Conta Conjunta')
    expect(within(dialogo).getByLabelText('Valor')).toHaveValue('70,00')
    expect(within(dialogo).getByLabelText('Data')).toHaveValue('2026-10-10')
    expect(within(dialogo).queryByRole('button', { name: 'Salvar e criar nova' })).not.toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 50))
    expect(api.chamadasDe('GET /api/proporcao/sugestao-aporte')).toHaveLength(0)
    expect(within(dialogo).getByLabelText('Valor')).toHaveValue('70,00')
  })
})

describe('"Salvar e criar nova" na transferência (docs/revisoes/t193.md)', () => {
  it('na transferência livre grava e reabre o formulário vazio', async () => {
    const api = montar()
    const { user } = renderizarApp('/controle')
    const dialogo = await abrirTransferenciaLivre(user)
    await within(within(dialogo).getByLabelText('Conta de origem')).findByRole('option', { name: 'Conta Bruno' })
    await user.selectOptions(within(dialogo).getByLabelText('Conta de origem'), 'Conta Bruno')
    await user.selectOptions(within(dialogo).getByLabelText('Conta de destino'), 'Conta Ana')
    await user.type(within(dialogo).getByLabelText('Valor'), '1000')

    await user.click(within(dialogo).getByRole('button', { name: 'Salvar e criar nova' }))

    await waitFor(() => expect(api.chamadasDe('POST /api/lancamentos')).toHaveLength(1))
    await waitFor(() => expect(within(dialogo).getByLabelText('Valor')).toHaveValue(''))
    expect(screen.getByRole('dialog', { name: 'Nova transferência' })).toBeInTheDocument()
  })

  it('no aporte, depois de "Salvar e criar nova", o formulário novo mantém origem e destino do aporte', async () => {
    const api = montar()
    const { user } = renderizarApp('/')
    const dialogo = await abrirAporteDaAna(user)
    await waitFor(() => expect(within(dialogo).getByLabelText('Valor')).toHaveValue('500,00'))

    await user.click(within(dialogo).getByRole('button', { name: 'Salvar e criar nova' }))

    await waitFor(() => expect(api.chamadasDe('POST /api/lancamentos')).toHaveLength(1))
    const novo = await screen.findByRole('dialog', { name: 'Nova transferência' })
    // Sem perder o preenchimento: continua de Conta Ana para a conjunta.
    await waitFor(() => expect(within(novo).getByLabelText('Conta de origem')).toHaveDisplayValue('Conta Ana'))
    expect(within(novo).getByLabelText('Conta de destino')).toHaveDisplayValue('Conta Conjunta')
  })
})
