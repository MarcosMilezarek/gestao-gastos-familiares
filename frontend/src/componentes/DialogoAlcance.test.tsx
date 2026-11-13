import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import type { ItemLancamentoLista, ListaControle } from '../api/controle'
import type { LancamentoSaida } from '../api/lancamentos'
import { json, limparTudo, renderizarApp, semConteudo, simularApi, simularResizeObserver } from '../testes/utilitarios'
import { DialogoAlcance } from './DialogoAlcance'

afterEach(async () => {
  limparTudo()
  // O BottomSheet chama history.back() ao desmontar: deixa o popstate assíncrono terminar.
  await new Promise((r) => setTimeout(r, 10))
})

const OPCOES = ['Somente este', 'Este e os pendentes', 'Todos (incluindo confirmados)']
const ALCANCES = ['somente_este', 'este_e_pendentes', 'todos'] as const

function montarDialogo(sobre: Partial<React.ComponentProps<typeof DialogoAlcance>> = {}) {
  const onEscolher = vi.fn()
  const onCancelar = vi.fn()
  const resultado = render(
    <DialogoAlcance aberto acao="editar" onEscolher={onEscolher} onCancelar={onCancelar} {...sobre} />,
  )
  return { onEscolher, onCancelar, ...resultado, user: userEvent.setup() }
}

describe('DialogoAlcance: conteúdo', () => {
  it('fechado não monta nada', () => {
    montarDialogo({ aberto: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('para editar mostra o título de edição, as três opções e Cancelar', () => {
    montarDialogo()
    const dialogo = screen.getByRole('dialog', { name: 'Editar lançamento recorrente' })
    expect(dialogo).toHaveAttribute('aria-modal', 'true')
    for (const rotulo of OPCOES) expect(within(dialogo).getByRole('button', { name: rotulo })).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
  })

  it('para excluir mostra o título de exclusão', () => {
    montarDialogo({ acao: 'excluir' })
    expect(screen.getByRole('dialog', { name: 'Excluir lançamento recorrente' })).toBeInTheDocument()
  })

  it('aceita título e rótulos próprios (compra no cartão)', () => {
    montarDialogo({
      titulo: 'Compra parcelada',
      rotulos: { somente_este: 'Só esta parcela', este_e_pendentes: 'Esta e as próximas', todos: 'Toda a compra' },
    })
    expect(screen.getByRole('dialog', { name: 'Compra parcelada' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Só esta parcela' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Esta e as próximas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toda a compra' })).toBeInTheDocument()
  })

  it.each(OPCOES.map((rotulo, i) => [rotulo, ALCANCES[i]] as const))(
    'clicar em "%s" escolhe o alcance %s e nada mais',
    async (rotulo, alcance) => {
      const { onEscolher, onCancelar, user } = montarDialogo()
      await user.click(screen.getByRole('button', { name: rotulo }))
      expect(onEscolher).toHaveBeenCalledTimes(1)
      expect(onEscolher).toHaveBeenCalledWith(alcance)
      expect(onCancelar).not.toHaveBeenCalled()
    },
  )
})

describe('DialogoAlcance: teclado (roteiro t136)', () => {
  it('o foco inicial fica no próprio diálogo', () => {
    montarDialogo()
    expect(screen.getByRole('dialog')).toHaveFocus()
  })

  it('Tab fica preso: depois do último (Cancelar) volta ao primeiro (Fechar)', async () => {
    const { user } = montarDialogo()
    const ordem = ['Fechar', ...OPCOES, 'Cancelar']
    for (const nome of ordem) {
      await user.tab()
      expect(screen.getByRole('button', { name: nome })).toHaveFocus()
    }
    await user.tab()
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus()
  })

  it('Shift+Tab fica preso: do primeiro (Fechar) vai ao último (Cancelar)', async () => {
    const { user } = montarDialogo()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
  })

  it('Shift+Tab estando no próprio diálogo vai ao último', async () => {
    const { user } = montarDialogo()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
  })

  it('Esc cancela sem escolher alcance', async () => {
    const { onEscolher, onCancelar, user } = montarDialogo()
    await user.keyboard('{Escape}')
    expect(onCancelar).toHaveBeenCalledTimes(1)
    expect(onEscolher).not.toHaveBeenCalled()
  })

  it('"Cancelar" cancela sem escolher alcance', async () => {
    const { onEscolher, onCancelar, user } = montarDialogo()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onCancelar).toHaveBeenCalledTimes(1)
    expect(onEscolher).not.toHaveBeenCalled()
  })

  it('o botão "Fechar" cancela sem escolher alcance', async () => {
    const { onEscolher, onCancelar, user } = montarDialogo()
    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onCancelar).toHaveBeenCalledTimes(1)
    expect(onEscolher).not.toHaveBeenCalled()
  })

  it.each(OPCOES.map((rotulo, i) => [rotulo, ALCANCES[i]] as const))(
    'Enter e Espaço em "%s" escolhem %s',
    async (rotulo, alcance) => {
      const { onEscolher, user } = montarDialogo()
      screen.getByRole('button', { name: rotulo }).focus()
      await user.keyboard('{Enter}')
      expect(onEscolher).toHaveBeenCalledTimes(1)
      expect(onEscolher).toHaveBeenLastCalledWith(alcance)
      await user.keyboard(' ')
      expect(onEscolher).toHaveBeenCalledTimes(2)
      expect(onEscolher).toHaveBeenLastCalledWith(alcance)
    },
  )

  it('devolve o foco ao elemento que o abriu ao desmontar', async () => {
    function Pagina({ aberto }: { aberto: boolean }) {
      return (
        <>
          <button type="button">Abrir</button>
          <DialogoAlcance aberto={aberto} acao="editar" onEscolher={() => {}} onCancelar={() => {}} />
        </>
      )
    }
    const { rerender } = render(<Pagina aberto={false} />)
    screen.getByRole('button', { name: 'Abrir' }).focus()
    rerender(<Pagina aberto />)
    expect(screen.getByRole('dialog')).toHaveFocus()
    rerender(<Pagina aberto={false} />)
    expect(screen.getByRole('button', { name: 'Abrir' })).toHaveFocus()
  })
})

// ---- Pela tela de Controle, com o window.history real do jsdom ----

const OCORRENCIA: LancamentoSaida = {
  id: 204,
  tipo: 'despesa',
  valor: '1500.00',
  data: '2026-10-20',
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
  recorrente: true,
  recorrencia_id: 9,
  numero_recorrencia: 4,
  total_ocorrencias: 6,
  meta: null,
}

function montarApp() {
  simularResizeObserver()
  const item: ItemLancamentoLista = {
    kind: 'lancamento',
    lancamento: OCORRENCIA,
    conta_nome: 'Conta Ana',
    conta_destino_nome: null,
    rotulo: 'Despesa',
    meta: null,
  }
  const lista: ListaControle = {
    mes: '2026-10',
    filtros_ativos: false,
    resumo: {
      entradas: { previsto: '0.00', realizado: '0.00' },
      saidas: { previsto: '0.00', realizado: '0.00' },
      saldo: { previsto: '0.00', realizado: '0.00' },
      saldo_atual_total: '0.00',
    },
    dias: [{ data: '2026-10-20', saldo_fim_do_dia: '0.00', itens: [item] }],
  }
  return simularApi({
    'GET /api/contas': json({
      mes: '2026-10',
      contas: [
        {
          id: 1, nome: 'Conta Ana', instituicao: null, tipo: 'conta_corrente', cor: '#336699', saldo_inicial: '0.00',
          dono_usuario_id: 1, arquivado: false, casal_encerrado: false, saldo_atual: '0.00', saldo_previsto: '0.00',
        },
      ],
      total_saldo_atual: null,
      total_saldo_previsto: null,
    }),
    'GET /api/categorias': json([]),
    'GET /api/tags': json([]),
    'GET /api/controle/lista': json(lista),
    'DELETE /api/lancamentos/204': semConteudo(),
  })
}

const escritas = (api: ReturnType<typeof montarApp>) => api.chamadas.filter((c) => c.metodo !== 'GET')

// O history.back() do BottomSheet é assíncrono no jsdom: dá tempo para o popstate (se houver) chegar.
const aguardarHistorico = () => act(() => new Promise<void>((r) => setTimeout(r, 50)))

describe('DialogoAlcance na tela: teclado e API', () => {
  async function abrirEdicao(user: ReturnType<typeof renderizarApp>['user']) {
    await screen.findByText('Aluguel')
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    return screen.findByRole('dialog', { name: 'Editar lançamento recorrente' })
  }

  it('Esc fecha o diálogo sem chamar a API de escrita nem abrir o formulário', async () => {
    const api = montarApp()
    const { user } = renderizarApp('/controle')
    await abrirEdicao(user)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(escritas(api)).toHaveLength(0)
  })

  it('"Cancelar" fecha o diálogo sem chamar a API de escrita', async () => {
    const api = montarApp()
    const { user } = renderizarApp('/controle')
    const dialogo = await abrirEdicao(user)
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(escritas(api)).toHaveLength(0)
  })

  it('Enter numa opção de exclusão dispara o DELETE com o alcance, sem confirmação extra', async () => {
    const api = montarApp()
    const { user } = renderizarApp('/controle')
    await screen.findByText('Aluguel')
    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir lançamento recorrente' })
    within(dialogo).getByRole('button', { name: 'Este e os pendentes' }).focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(api.chamadasDe('DELETE /api/lancamentos/204')).toHaveLength(1))
    expect(api.chamadasDe('DELETE /api/lancamentos/204')[0]?.params).toEqual({ alcance: 'este_e_pendentes' })
  })
})

describe('troca de sheets: diálogo de alcance -> formulário (histórico real)', () => {
  async function abrirFormulario(user: ReturnType<typeof renderizarApp>['user']) {
    await screen.findByText('Aluguel')
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await screen.findByRole('dialog', { name: 'Editar lançamento recorrente' })
    // O diálogo desmonta e chama history.back() no mesmo lote em que o formulário monta (pushState).
    await user.click(screen.getByRole('button', { name: 'Todos (incluindo confirmados)' }))
    const form = await screen.findByRole('dialog', { name: 'Editar despesa' })
    await aguardarHistorico()
    return form
  }

  async function fecharComEsc(user: ReturnType<typeof renderizarApp>['user']) {
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await aguardarHistorico()
  }

  it('escolher o alcance desmonta o diálogo e monta o formulário, que abre e permanece', async () => {
    montarApp()
    const { user } = renderizarApp('/controle')
    await abrirFormulario(user)
    expect(screen.queryByRole('dialog', { name: 'Editar lançamento recorrente' })).not.toBeInTheDocument()
    // O history.back() do diálogo é assíncrono: depois dele o formulário continua aberto.
    expect(screen.getByRole('dialog', { name: 'Editar despesa' })).toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  // D-065: pulado. No jsdom o history.back() do diálogo é anulado pelo pushState do formulário;
  // a testes4 reproduz o comportamento com Playwright.
  // No jsdom o pushState do formulário cancela o history.back() pendente do diálogo: a pilha fica
  // [inicial, diálogo, formulário] e um único "Voltar" cai na entrada do diálogo (bottomSheet: true),
  // que o BottomSheet ignora. O formulário só fecharia no segundo "Voltar".
  it.skip('"Voltar" do navegador fecha só o formulário e a página continua', async () => {
    montarApp()
    const { user } = renderizarApp('/controle')
    await abrirFormulario(user)
    act(() => window.history.back())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Controle' })).toBeInTheDocument()
    expect(screen.getByText('Aluguel')).toBeInTheDocument()
  })

  it('Esc fecha o formulário depois da troca de sheets', async () => {
    montarApp()
    const { user } = renderizarApp('/controle')
    await abrirFormulario(user)
    await fecharComEsc(user)
    expect(screen.getByRole('heading', { name: 'Controle' })).toBeInTheDocument()
  })

  it('o formulário pode ser aberto e fechado de novo depois da troca', async () => {
    montarApp()
    const { user } = renderizarApp('/controle')
    await abrirFormulario(user)
    await fecharComEsc(user)
    await abrirFormulario(user)
    expect(screen.getByRole('dialog', { name: 'Editar despesa' })).toBeInTheDocument()
  })
})
