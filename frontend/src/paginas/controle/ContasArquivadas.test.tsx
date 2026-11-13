import { afterEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { ContaSaida, ListagemContas } from '../../api/contas'
import type { ListaControle } from '../../api/controle'
import { erroApi, json, limparTudo, renderizarApp, simularApi } from '../../testes/utilitarios'

afterEach(limparTudo)

function conta(parcial: Partial<ContaSaida> & { id: number; nome: string }): ContaSaida {
  return {
    instituicao: null,
    tipo: 'conta_corrente',
    cor: '#1E88E5',
    saldo_inicial: '0.00',
    dono_usuario_id: 1,
    arquivado: true,
    casal_encerrado: false,
    saldo_atual: '0.00',
    saldo_previsto: '0.00',
    ...parcial,
  }
}

function listagem(contas: ContaSaida[]): ListagemContas {
  return { mes: '2026-10', contas, total_saldo_atual: null, total_saldo_previsto: null }
}

const ANTIGA = conta({ id: 5, nome: 'Conta antiga', saldo_atual: '123.45', saldo_previsto: '123.45' })
const CONJUNTA_ENCERRADA = conta({
  id: 6,
  nome: 'Conjunta encerrada',
  dono_usuario_id: null,
  casal_encerrado: true,
})

const listaVazia: ListaControle = {
  mes: '2026-10',
  filtros_ativos: false,
  resumo: {
    entradas: { previsto: '0.00', realizado: '0.00' },
    saidas: { previsto: '0.00', realizado: '0.00' },
    saldo: { previsto: '0.00', realizado: '0.00' },
    saldo_atual_total: '0.00',
  },
  dias: [],
}

describe('ContasArquivadas (CA-2.05, CA-0.07)', () => {
  it('consulta só as arquivadas e mostra nome e saldo de cada conta', async () => {
    const api = simularApi({ 'GET /api/contas': json(listagem([ANTIGA])) })
    renderizarApp('/controle/contas/arquivadas')
    const card = (await screen.findByRole('heading', { name: 'Conta antiga' })).closest('article')!
    expect(within(card).getAllByText('R$ 123,45')).toHaveLength(2)
    expect(api.chamadasDe('GET /api/contas')[0]!.params).toEqual({ arquivadas: 'true' })
  })

  it('não oferece editar, reajustar nem arquivar na conta arquivada', async () => {
    simularApi({ 'GET /api/contas': json(listagem([ANTIGA])) })
    renderizarApp('/controle/contas/arquivadas')
    await screen.findByRole('heading', { name: 'Conta antiga' })
    for (const nome of ['Editar', 'Reajustar', 'Arquivar']) {
      expect(screen.queryByRole('button', { name: nome })).toBeNull()
    }
    expect(screen.getByRole('button', { name: 'Ver lançamentos' })).toBeInTheDocument()
  })

  it('desarquivar chama a API e a conta sai da lista de arquivadas', async () => {
    let arquivadas = [ANTIGA]
    const api = simularApi({
      'GET /api/contas': () => json(listagem(arquivadas)),
      'POST /api/contas/5/desarquivar': () => {
        arquivadas = []
        return json({ ...ANTIGA, arquivado: false })
      },
    })
    const { user } = renderizarApp('/controle/contas/arquivadas')
    await user.click(await screen.findByRole('button', { name: 'Desarquivar' }))
    expect(await screen.findByText('Nenhuma conta arquivada.')).toBeInTheDocument()
    expect(api.chamadasDe('POST /api/contas/5/desarquivar')).toHaveLength(1)
  })

  it('desarquivada, a conta volta à lista principal de Contas', async () => {
    let arquivada = true
    simularApi({
      'GET /api/contas': (c) =>
        c.params.arquivadas === 'true'
          ? json(listagem(arquivada ? [ANTIGA] : []))
          : json({ ...listagem(arquivada ? [] : [{ ...ANTIGA, arquivado: false }]) }),
      'POST /api/contas/5/desarquivar': () => {
        arquivada = false
        return json({ ...ANTIGA, arquivado: false })
      },
    })
    const { user } = renderizarApp('/controle/contas/arquivadas')
    await user.click(await screen.findByRole('button', { name: 'Desarquivar' }))
    await screen.findByText('Nenhuma conta arquivada.')
    await user.click(screen.getByRole('button', { name: 'Ver contas' }))
    expect(await screen.findByRole('heading', { name: 'Conta antiga' })).toBeInTheDocument()
  })

  it('conta de casal encerrado não tem o botão Desarquivar (CA-1.10)', async () => {
    simularApi({ 'GET /api/contas': json(listagem([CONJUNTA_ENCERRADA])) })
    renderizarApp('/controle/contas/arquivadas')
    await screen.findByRole('heading', { name: 'Conjunta encerrada' })
    expect(screen.queryByRole('button', { name: 'Desarquivar' })).toBeNull()
  })

  it('recusa do servidor ao desarquivar mostra a mensagem', async () => {
    simularApi({
      'GET /api/contas': json(listagem([ANTIGA])),
      'POST /api/contas/5/desarquivar': erroApi(409, 'CASAL_ENCERRADO', 'Esta conta não pode ser desarquivada.'),
    })
    const { user } = renderizarApp('/controle/contas/arquivadas')
    await user.click(await screen.findByRole('button', { name: 'Desarquivar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta conta não pode ser desarquivada.')
  })

  it('estado vazio mostra a frase e o botão "Ver contas" que leva à lista principal (CA-0.07)', async () => {
    simularApi({
      'GET /api/contas': (c) =>
        c.params.arquivadas === 'true'
          ? json(listagem([]))
          : json({ mes: '2026-10', contas: [], total_saldo_atual: null, total_saldo_previsto: null }),
    })
    const { user } = renderizarApp('/controle/contas/arquivadas')
    expect(await screen.findByText('Nenhuma conta arquivada.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ver contas' }))
    expect(await screen.findByRole('heading', { name: 'Contas' })).toBeInTheDocument()
  })

  it('"Ver lançamentos" abre o controle da conta arquivada', async () => {
    simularApi({
      'GET /api/contas': json(listagem([ANTIGA])),
      'GET /api/contas/5': json(ANTIGA),
      'GET /api/controle/lista': json(listaVazia),
    })
    const { user } = renderizarApp('/controle/contas/arquivadas')
    await user.click(await screen.findByRole('button', { name: 'Ver lançamentos' }))
    expect(await screen.findByRole('heading', { name: 'Conta antiga' })).toBeInTheDocument()
  })

  it('erro ao listar mostra a mensagem do servidor', async () => {
    simularApi({ 'GET /api/contas': erroApi(500, 'ERRO_INTERNO', 'Falha ao listar.') })
    renderizarApp('/controle/contas/arquivadas')
    expect(await screen.findByText('Falha ao listar.')).toBeInTheDocument()
  })
})
