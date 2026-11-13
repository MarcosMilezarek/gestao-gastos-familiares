import { afterEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { ContaSaida } from '../../api/contas'
import type { ItemLancamentoLista, ListaControle } from '../../api/controle'
import { erroApi, json, limparTudo, renderizarApp, simularApi } from '../../testes/utilitarios'

afterEach(limparTudo)

const CONTA: ContaSaida = {
  id: 1,
  nome: 'Conta da Ana',
  instituicao: null,
  tipo: 'conta_corrente',
  cor: '#1E88E5',
  saldo_inicial: '1000.00',
  dono_usuario_id: 1,
  arquivado: false,
  casal_encerrado: false,
  saldo_atual: '900.00',
  saldo_previsto: '850.00',
}
const ARQUIVADA: ContaSaida = { ...CONTA, id: 2, nome: 'Conta velha', arquivado: true }

const ITEM: ItemLancamentoLista = {
  kind: 'lancamento',
  conta_nome: 'Conta da Ana',
  conta_destino_nome: null,
  rotulo: 'Despesa',
  meta: null,
  lancamento: {
    id: 10,
    tipo: 'despesa',
    valor: '50.00',
    data: '2026-10-20',
    situacao: 'prevista',
    descricao: 'Mercado do mês',
    categoria: { id: 1, nome: 'Mercado', pai_nome: null, cor: '#2E7D32', icone: 'shopping-cart' },
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
  },
}

function lista(itens: ItemLancamentoLista[]): ListaControle {
  return {
    mes: '2026-10',
    filtros_ativos: false,
    resumo: {
      entradas: { previsto: '0.00', realizado: '0.00' },
      saidas: { previsto: '0.00', realizado: '0.00' },
      saldo: { previsto: '0.00', realizado: '0.00' },
      saldo_atual_total: '0.00',
    },
    dias: itens.length ? [{ data: '2026-10-20', itens, saldo_fim_do_dia: '850.00' }] : [],
  }
}

describe('ControleConta (CA-2.05, CA-0.07)', () => {
  it('mostra o nome da conta e os lançamentos filtrados por conta_id', async () => {
    const api = simularApi({
      'GET /api/contas/1': json(CONTA),
      'GET /api/controle/lista': json(lista([ITEM])),
    })
    renderizarApp('/controle/contas/1')
    expect(await screen.findByRole('heading', { name: 'Conta da Ana' })).toBeInTheDocument()
    expect(await screen.findByText('Mercado do mês')).toBeInTheDocument()
    const lancamentos = api.chamadasDe('GET /api/controle/lista')
    expect(lancamentos[0]!.params.conta_id).toBe('1')
    expect(lancamentos[0]!.params.mes).toBe('2026-10')
  })

  it('conta ativa permite confirmar, editar e excluir lançamentos', async () => {
    simularApi({
      'GET /api/contas/1': json(CONTA),
      'GET /api/controle/lista': json(lista([ITEM])),
    })
    renderizarApp('/controle/contas/1')
    await screen.findByText('Mercado do mês')
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeInTheDocument()
  })

  it('conta arquivada mostra os lançamentos mas não permite confirmar, editar nem excluir', async () => {
    simularApi({
      'GET /api/contas/2': json(ARQUIVADA),
      'GET /api/controle/lista': json(lista([ITEM])),
    })
    renderizarApp('/controle/contas/2')
    expect(await screen.findByRole('heading', { name: 'Conta velha' })).toBeInTheDocument()
    expect(await screen.findByText('Mercado do mês')).toBeInTheDocument()
    for (const nome of ['Confirmar', 'Editar', 'Excluir']) {
      expect(screen.queryByRole('button', { name: nome })).toBeNull()
    }
  })

  it('conta ativa sem lançamentos mostra o estado vazio com botão "Novo lançamento" que abre o formulário', async () => {
    simularApi({
      'GET /api/contas/1': json(CONTA),
      'GET /api/controle/lista': json(lista([])),
      'GET /api/contas': json({ mes: '2026-10', contas: [CONTA], total_saldo_atual: null, total_saldo_previsto: null }),
      'GET /api/categorias': json([]),
      'GET /api/tags': json([]),
    })
    const { user } = renderizarApp('/controle/contas/1')
    expect(await screen.findByText('Nenhum lançamento para mostrar.')).toBeInTheDocument()
    // Só o botão do estado vazio (dentro de <main>), não o "+" da barra inferior.
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Novo lançamento' }))
    expect(await screen.findByRole('dialog', { name: /despesa/i })).toBeInTheDocument()
  })

  it('conta arquivada sem lançamentos não oferece "Novo lançamento"', async () => {
    simularApi({
      'GET /api/contas/2': json(ARQUIVADA),
      'GET /api/controle/lista': json(lista([])),
    })
    renderizarApp('/controle/contas/2')
    await screen.findByRole('heading', { name: 'Conta velha' })
    expect(await screen.findByText('Nenhum lançamento para mostrar.')).toBeInTheDocument()
    expect(within(screen.getByRole('main')).queryByRole('button', { name: 'Novo lançamento' })).toBeNull()
  })

  it('identificador inválido na rota mostra "Conta não encontrada." sem chamar a API da conta', async () => {
    const api = simularApi({})
    renderizarApp('/controle/contas/abc')
    expect(await screen.findByText('Conta não encontrada.')).toBeInTheDocument()
    expect(api.chamadas.filter((c) => c.caminho.startsWith('/api/contas'))).toHaveLength(0)
  })

  it('conta inexistente (404 do servidor) mostra a mensagem', async () => {
    simularApi({ 'GET /api/contas/99': erroApi(404, 'CONTA_NAO_ENCONTRADA', 'Conta não encontrada.') })
    renderizarApp('/controle/contas/99')
    expect(await screen.findByRole('alert')).toHaveTextContent('Conta não encontrada.')
  })

  it('o link "Contas" volta para a lista de contas', async () => {
    simularApi({
      'GET /api/contas/1': json(CONTA),
      'GET /api/controle/lista': json(lista([])),
      'GET /api/contas': json({ mes: '2026-10', contas: [CONTA], total_saldo_atual: '900.00', total_saldo_previsto: '850.00' }),
    })
    const { user } = renderizarApp('/controle/contas/1')
    await user.click(await screen.findByRole('link', { name: 'Contas' }))
    expect(await screen.findByRole('heading', { name: 'Contas' })).toBeInTheDocument()
  })
})
