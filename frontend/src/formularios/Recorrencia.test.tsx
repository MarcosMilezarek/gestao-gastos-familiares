import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import type { ContaSaida } from '../api/contas'
import type { ItemLancamentoLista, ListaControle } from '../api/controle'
import type { LancamentoSaida } from '../api/lancamentos'
import {
  json,
  limparTudo,
  renderizarApp,
  semConteudo,
  simularApi,
  simularResizeObserver,
} from '../testes/utilitarios'
import { CampoRecorrencia, type ValorRecorrencia } from './CampoRecorrencia'

afterEach(async () => {
  limparTudo()
  await new Promise((r) => setTimeout(r, 10))
})

describe('CampoRecorrencia', () => {
  it('começa desligado: interruptor desmarcado e sem opções de repetição', () => {
    render(<CampoRecorrencia valor={null} aoMudar={() => {}} />)
    const chave = screen.getByRole('switch', { name: 'Recorrente' })
    expect(chave).toHaveAttribute('aria-checked', 'false')
    expect(chave).toHaveTextContent('Desligado')
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('ligar avisa "mensal, sem fim" e desligar avisa null', async () => {
    const aoMudar = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<CampoRecorrencia valor={null} aoMudar={aoMudar} />)
    await user.click(screen.getByRole('switch', { name: 'Recorrente' }))
    expect(aoMudar).toHaveBeenLastCalledWith({ modo: 'sem_fim' })

    rerender(<CampoRecorrencia valor={{ modo: 'sem_fim' }} aoMudar={aoMudar} />)
    expect(screen.getByRole('switch', { name: 'Recorrente' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('switch', { name: 'Recorrente' }))
    expect(aoMudar).toHaveBeenLastCalledWith(null)
  })

  it('ligado oferece as duas repetições, com "sem data de fim" marcada e sem campo de meses', () => {
    render(<CampoRecorrencia valor={{ modo: 'sem_fim' }} aoMudar={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Mensal, sem data de fim' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Repetir N meses' })).not.toBeChecked()
    expect(screen.queryByLabelText('Número de meses')).not.toBeInTheDocument()
  })

  it('"Repetir N meses" mostra o campo numérico (2 a 60) e entrega os meses digitados como texto', async () => {
    function Harness() {
      const [valor, setValor] = useState<ValorRecorrencia | null>({ modo: 'sem_fim' })
      return (
        <>
          <CampoRecorrencia valor={valor} aoMudar={setValor} />
          <output data-testid="saida">{JSON.stringify(valor)}</output>
        </>
      )
    }
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('radio', { name: 'Repetir N meses' }))
    const meses = screen.getByLabelText('Número de meses')
    expect(meses).toHaveAttribute('type', 'number')
    expect(meses).toHaveAttribute('min', '2')
    expect(meses).toHaveAttribute('max', '60')
    expect(screen.getByTestId('saida')).toHaveTextContent('{"modo":"n_meses","meses":""}')
    await user.type(meses, '12')
    expect(screen.getByTestId('saida')).toHaveTextContent('{"modo":"n_meses","meses":"12"}')
    await user.click(screen.getByRole('radio', { name: 'Mensal, sem data de fim' }))
    expect(screen.getByTestId('saida')).toHaveTextContent('{"modo":"sem_fim"}')
    expect(screen.queryByLabelText('Número de meses')).not.toBeInTheDocument()
  })

  it('mostra a mensagem de erro junto ao campo', () => {
    render(<CampoRecorrencia valor={null} aoMudar={() => {}} erro="Informe de 2 a 60 meses." />)
    expect(screen.getByText('Informe de 2 a 60 meses.')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Recorrente' })).toHaveAttribute('aria-invalid', 'true')
  })
})

// ---- Edição e exclusão com alcance, pela tela de Controle ----

const CONTAS: ContaSaida[] = [
  {
    id: 1,
    nome: 'Conta Ana',
    instituicao: null,
    tipo: 'conta_corrente',
    cor: '#336699',
    saldo_inicial: '0.00',
    dono_usuario_id: 1,
    arquivado: false,
    casal_encerrado: false,
    saldo_atual: '0.00',
    saldo_previsto: '0.00',
  },
]

function lancamento(sobre: Partial<LancamentoSaida>): LancamentoSaida {
  return {
    id: 1,
    tipo: 'despesa',
    valor: '1500.00',
    data: '2026-10-10',
    situacao: 'prevista',
    descricao: 'Aluguel',
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

// 4ª ocorrência (pendente) de uma série de 6 e um lançamento simples.
const OCORRENCIA = lancamento({
  id: 204,
  recorrente: true,
  recorrencia_id: 9,
  numero_recorrencia: 4,
  total_ocorrencias: 6,
  descricao: 'Aluguel',
  data: '2026-10-20',
})
const SIMPLES = lancamento({ id: 300, descricao: 'Padaria', valor: '50.00', data: '2026-10-12', situacao: 'confirmada' })

function lista(lancs: LancamentoSaida[]): ListaControle {
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
          conta_nome: 'Conta Ana',
          conta_destino_nome: null,
          rotulo: 'Despesa',
          meta: null,
        } satisfies ItemLancamentoLista,
      ],
    })),
  }
}

function montar() {
  simularResizeObserver()
  return simularApi({
    'GET /api/contas': json({ mes: '2026-10', contas: CONTAS, total_saldo_atual: null, total_saldo_previsto: null }),
    'GET /api/categorias': json([
      { id: 10, nome: 'Mercado', tipo: 'despesa', icone: 'tag', cor: '#112233', fixa: false, arquivado: false, categoria_pai_id: null, subcategorias: [] },
    ]),
    'GET /api/tags': json([]),
    'GET /api/controle/lista': json(lista([SIMPLES, OCORRENCIA])),
    'PATCH /api/lancamentos/204': json(OCORRENCIA),
    'PATCH /api/lancamentos/300': json(SIMPLES),
    'DELETE /api/lancamentos/204': semConteudo(),
    'DELETE /api/lancamentos/300': semConteudo(),
  })
}

const linha = (descricao: string) => screen.getByText(descricao).closest('li') as HTMLElement

async function pedir(user: ReturnType<typeof userEvent.setup>, descricao: string, acao: 'Editar' | 'Excluir') {
  await screen.findByText(descricao)
  await user.click(within(linha(descricao)).getByRole('button', { name: acao }))
}

describe('alcance perguntado só para recorrente (CA-0.10, CA-3.07)', () => {
  it('editar lançamento simples abre o formulário direto, sem a pergunta de alcance', async () => {
    montar()
    const { user } = renderizarApp('/controle')
    await pedir(user, 'Padaria', 'Editar')
    expect(await screen.findByRole('dialog', { name: 'Editar despesa' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Editar lançamento recorrente' })).not.toBeInTheDocument()
  })

  it('excluir lançamento simples pede só a confirmação e exclui sem alcance', async () => {
    const api = montar()
    const { user } = renderizarApp('/controle')
    await pedir(user, 'Padaria', 'Excluir')
    const confirmacao = await screen.findByRole('dialog', { name: 'Excluir lançamento' })
    expect(screen.queryByRole('dialog', { name: 'Excluir lançamento recorrente' })).not.toBeInTheDocument()
    await user.click(within(confirmacao).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(api.chamadasDe('DELETE /api/lancamentos/300')).toHaveLength(1))
    expect(api.chamadasDe('DELETE /api/lancamentos/300')[0]?.params).toEqual({})
  })

  it('editar ocorrência de recorrente pergunta o alcance com as 3 opções', async () => {
    montar()
    const { user } = renderizarApp('/controle')
    await pedir(user, 'Aluguel', 'Editar')
    const dialogo = await screen.findByRole('dialog', { name: 'Editar lançamento recorrente' })
    expect(within(dialogo).getAllByRole('button', { name: /^(Somente este|Este e os pendentes|Todos \(incluindo confirmados\))$/ })).toHaveLength(3)
  })

  it('excluir ocorrência de recorrente pergunta o alcance com as 3 opções', async () => {
    montar()
    const { user } = renderizarApp('/controle')
    await pedir(user, 'Aluguel', 'Excluir')
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir lançamento recorrente' })
    expect(within(dialogo).getByRole('button', { name: 'Somente este' })).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Este e os pendentes' })).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Todos (incluindo confirmados)' })).toBeInTheDocument()
  })

  it('Cancelar na pergunta de alcance não abre formulário nem chama a API de escrita', async () => {
    const api = montar()
    const { user } = renderizarApp('/controle')
    await pedir(user, 'Aluguel', 'Editar')
    const dialogo = await screen.findByRole('dialog', { name: 'Editar lançamento recorrente' })
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.chamadas.filter((c) => c.metodo !== 'GET')).toHaveLength(0)
  })
})

describe('editar com alcance (CA-3.05, lado da tela)', () => {
  async function editarValor(alcance: string) {
    const api = montar()
    const { user } = renderizarApp('/controle')
    await pedir(user, 'Aluguel', 'Editar')
    await user.click(await screen.findByRole('button', { name: alcance }))
    await screen.findByRole('dialog', { name: 'Editar despesa' })
    await waitFor(() => expect(screen.getByLabelText('Conta')).toHaveDisplayValue('Conta Ana'))
    const valor = screen.getByLabelText('Valor')
    expect(valor).toHaveValue('1.500,00')
    await user.clear(valor)
    await user.type(valor, '180000')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.chamadasDe('PATCH /api/lancamentos/204')).toHaveLength(1))
    return { api, user }
  }

  it('"Somente este" envia PATCH ?alcance=somente_este com o formulário inteiro', async () => {
    const { api } = await editarValor('Somente este')
    const chamada = api.chamadasDe('PATCH /api/lancamentos/204')[0]
    expect(chamada?.params).toEqual({ alcance: 'somente_este' })
    expect(chamada?.corpo).toEqual({
      valor: '1800.00',
      data: '2026-10-20',
      descricao: 'Aluguel',
      categoria_id: 10,
      dono_usuario_id: 1,
      conta_id: 1,
      tag_ids: [],
      observacao: '',
      situacao: 'prevista',
    })
  })

  it('"Este e os pendentes" envia PATCH ?alcance=este_e_pendentes só com o campo alterado, sem situacao', async () => {
    const { api } = await editarValor('Este e os pendentes')
    const chamada = api.chamadasDe('PATCH /api/lancamentos/204')[0]
    expect(chamada?.params).toEqual({ alcance: 'este_e_pendentes' })
    expect(chamada?.corpo).toEqual({ valor: '1800.00' })
  })

  it('"Todos" envia PATCH ?alcance=todos só com o campo alterado, sem situacao', async () => {
    const { api } = await editarValor('Todos (incluindo confirmados)')
    const chamada = api.chamadasDe('PATCH /api/lancamentos/204')[0]
    expect(chamada?.params).toEqual({ alcance: 'todos' })
    expect(chamada?.corpo).toEqual({ valor: '1800.00' })
  })

  it('com alcance múltiplo o formulário não mostra "Foi paga"; com "Somente este" mostra', async () => {
    montar()
    const { user } = renderizarApp('/controle')
    await pedir(user, 'Aluguel', 'Editar')
    await user.click(await screen.findByRole('button', { name: 'Todos (incluindo confirmados)' }))
    await screen.findByRole('dialog', { name: 'Editar despesa' })
    expect(screen.queryByLabelText('Foi paga')).not.toBeInTheDocument()
  })

  it('"Somente este" mostra "Foi paga"', async () => {
    montar()
    const { user } = renderizarApp('/controle')
    await pedir(user, 'Aluguel', 'Editar')
    await user.click(await screen.findByRole('button', { name: 'Somente este' }))
    await screen.findByRole('dialog', { name: 'Editar despesa' })
    expect(screen.getByLabelText('Foi paga')).not.toBeChecked()
  })

  it('a edição não oferece recorrência nem "Salvar e criar nova"', async () => {
    montar()
    const { user } = renderizarApp('/controle')
    await pedir(user, 'Aluguel', 'Editar')
    await user.click(await screen.findByRole('button', { name: 'Somente este' }))
    const form = await screen.findByRole('dialog', { name: 'Editar despesa' })
    await user.click(within(form).getByRole('button', { name: 'Mais detalhes' }))
    expect(within(form).queryByRole('switch', { name: 'Recorrente' })).not.toBeInTheDocument()
    expect(within(form).queryByRole('button', { name: 'Salvar e criar nova' })).not.toBeInTheDocument()
  })

  it.each(['Este e os pendentes', 'Todos (incluindo confirmados)'])(
    'alcance "%s" sem nenhuma alteração não envia PATCH com corpo vazio (t136 S1)',
    async (alcance) => {
      const api = montar()
      const { user } = renderizarApp('/controle')
      await pedir(user, 'Aluguel', 'Editar')
      await user.click(await screen.findByRole('button', { name: alcance }))
      await screen.findByRole('dialog', { name: 'Editar despesa' })
      await waitFor(() => expect(screen.getByLabelText('Conta')).toHaveDisplayValue('Conta Ana'))
      await user.click(screen.getByRole('button', { name: 'Salvar' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar despesa' })).not.toBeInTheDocument())
      const patches = api.chamadas.filter((c) => c.metodo === 'PATCH')
      expect(patches.filter((c) => JSON.stringify(c.corpo) === '{}')).toHaveLength(0)
    },
  )
})

describe('excluir com alcance (CA-3.06, lado da tela)', () => {
  it.each([
    ['Somente este', 'somente_este'],
    ['Este e os pendentes', 'este_e_pendentes'],
    ['Todos (incluindo confirmados)', 'todos'],
  ])('"%s" exclui com DELETE ?alcance=%s, sem outra confirmação', async (rotulo, alcance) => {
    const api = montar()
    const { user } = renderizarApp('/controle')
    await pedir(user, 'Aluguel', 'Excluir')
    await user.click(await screen.findByRole('button', { name: rotulo }))
    await waitFor(() => expect(api.chamadasDe('DELETE /api/lancamentos/204')).toHaveLength(1))
    expect(api.chamadasDe('DELETE /api/lancamentos/204')[0]?.params).toEqual({ alcance })
    expect(screen.queryByRole('dialog', { name: 'Excluir lançamento' })).not.toBeInTheDocument()
  })

  it('depois de excluir, a lista é buscada de novo', async () => {
    const api = montar()
    const { user } = renderizarApp('/controle')
    await pedir(user, 'Aluguel', 'Excluir')
    const antes = api.chamadasDe('GET /api/controle/lista').length
    await user.click(await screen.findByRole('button', { name: 'Todos (incluindo confirmados)' }))
    await waitFor(() => expect(api.chamadasDe('GET /api/controle/lista').length).toBeGreaterThan(antes))
  })
})
