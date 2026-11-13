import { afterEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { BalancoConta, BalancoMes, DonoBalanco, Par } from '../../api/controle'
import { erroApi, json, limparTudo, renderizarApp, simularApi } from '../../testes/utilitarios'

afterEach(limparTudo)

const par = (previsto: string, realizado: string): Par => ({ previsto, realizado })
const ZERO = par('0.00', '0.00')

// Cenário-base de CA-5.01 a CA-5.03.
const CONTA_A: BalancoConta = {
  conta_id: 1,
  nome: 'Conta A',
  dono_usuario_id: 1,
  entradas: par('6000.00', '6000.00'),
  saidas: par('200.00', '200.00'),
  transferencias_entrada: ZERO,
  transferencias_saida: par('900.00', '900.00'),
  saldo: par('5800.00', '5800.00'),
  saldo_atual: '4900.00',
  saldo_previsto: '4900.00',
}
const CONTA_B: BalancoConta = {
  conta_id: 2,
  nome: 'Conta B',
  dono_usuario_id: 2,
  entradas: par('4000.00', '0.00'),
  saidas: ZERO,
  transferencias_entrada: ZERO,
  transferencias_saida: ZERO,
  saldo: par('4000.00', '0.00'),
  saldo_atual: '50.00',
  saldo_previsto: '4050.00',
}
const CONTA_CONJUNTA: BalancoConta = {
  conta_id: 3,
  nome: 'Conta Conjunta',
  dono_usuario_id: null,
  entradas: ZERO,
  saidas: par('2800.00', '1500.00'),
  transferencias_entrada: par('900.00', '900.00'),
  transferencias_saida: ZERO,
  saldo: par('-2800.00', '-1500.00'),
  saldo_atual: '-600.00',
  saldo_previsto: '-1900.00',
}
const DONOS: DonoBalanco[] = [
  { dono_usuario_id: 1, nome: 'Ana', entradas: par('6000.00', '6000.00'), saidas: par('200.00', '200.00'), saldo: par('5800.00', '5800.00') },
  { dono_usuario_id: 2, nome: 'Bruno', entradas: par('4000.00', '0.00'), saidas: ZERO, saldo: par('4000.00', '0.00') },
  { dono_usuario_id: null, nome: 'Casal', entradas: ZERO, saidas: par('2800.00', '1500.00'), saldo: par('-2800.00', '-1500.00') },
]
const BALANCO: BalancoMes = {
  mes: '2026-10',
  total: {
    entradas: par('10000.00', '6000.00'),
    saidas: par('3000.00', '1700.00'),
    saldo: par('7000.00', '4300.00'),
  },
  contas: [CONTA_A, CONTA_B, CONTA_CONJUNTA],
  donos: DONOS,
}

function secao(nome: string): HTMLElement {
  const titulo = screen.getByRole('heading', { level: 2, name: nome })
  return titulo.closest('section') as HTMLElement
}

// Valor da linha (Previsto/Realizado) dentro de um bloco rotulado do card.
function valorDe(card: HTMLElement, rotulo: string, coluna: 'Previsto' | 'Realizado'): string {
  const bloco = within(card).getByText(rotulo, { selector: 'p' }).parentElement as HTMLElement
  const dt = within(bloco).getByText(coluna, { selector: 'dt' })
  return dt.nextElementSibling?.textContent ?? ''
}

describe('Balanco (CA-5.01, CA-5.02, CA-5.03)', () => {
  it('consulta o balanço do mês da sessão e mostra o total (CA-5.01)', async () => {
    const api = simularApi({ 'GET /api/balanco': json(BALANCO) })
    renderizarApp('/controle/balanco')
    const total = await screen.findByRole('heading', { name: 'Total do mês' })
    expect(api.chamadasDe('GET /api/balanco')[0]!.params.mes).toBe('2026-10')
    const card = total.closest('section') as HTMLElement
    expect(valorDe(card, 'Entradas', 'Previsto')).toBe('+R$ 10.000,00')
    expect(valorDe(card, 'Entradas', 'Realizado')).toBe('+R$ 6.000,00')
    expect(valorDe(card, 'Saídas', 'Previsto')).toBe('-R$ 3.000,00')
    expect(valorDe(card, 'Saídas', 'Realizado')).toBe('-R$ 1.700,00')
    expect(valorDe(card, 'Saldo do mês', 'Previsto')).toBe('R$ 7.000,00')
    expect(valorDe(card, 'Saldo do mês', 'Realizado')).toBe('R$ 4.300,00')
  })

  it('mostra um card por conta com entradas e saídas (CA-5.02)', async () => {
    simularApi({ 'GET /api/balanco': json(BALANCO) })
    renderizarApp('/controle/balanco')
    await screen.findByRole('heading', { name: 'Total do mês' })

    const a = secao('Conta A')
    expect(valorDe(a, 'Entradas', 'Realizado')).toBe('+R$ 6.000,00')
    expect(valorDe(a, 'Saídas', 'Realizado')).toBe('-R$ 200,00')
  })

  it('card de conta: saldo atual e previsto, e transferências separadas do saldo do mês', async () => {
    simularApi({ 'GET /api/balanco': json(BALANCO) })
    renderizarApp('/controle/balanco')
    await screen.findByRole('heading', { name: 'Total do mês' })

    const a = secao('Conta A')
    expect(within(a).getByText('Saldo atual', { selector: 'p' }).nextElementSibling).toHaveTextContent('R$ 4.900,00')
    expect(within(a).getByText('Saldo previsto', { selector: 'p' }).nextElementSibling).toHaveTextContent('R$ 4.900,00')
    expect(within(a).getByRole('heading', { level: 3 })).toHaveTextContent(/informativo, não entram no saldo do mês/)
    expect(valorDe(a, 'Saída', 'Realizado')).toBe('R$ 900,00')

    const b = secao('Conta B')
    expect(valorDe(b, 'Entradas', 'Previsto')).toBe('+R$ 4.000,00')
    expect(valorDe(b, 'Entradas', 'Realizado')).toBe('R$ 0,00')
    expect(within(b).getByText('Saldo atual', { selector: 'p' }).nextElementSibling).toHaveTextContent('R$ 50,00')
    expect(within(b).getByText('Saldo previsto', { selector: 'p' }).nextElementSibling).toHaveTextContent('R$ 4.050,00')

    const conjunta = secao('Conta Conjunta')
    expect(valorDe(conjunta, 'Saídas', 'Previsto')).toBe('-R$ 2.800,00')
    expect(valorDe(conjunta, 'Saídas', 'Realizado')).toBe('-R$ 1.500,00')
    expect(valorDe(conjunta, 'Entrada', 'Realizado')).toBe('R$ 900,00')
    expect(within(conjunta).getByText('Saldo atual', { selector: 'p' }).nextElementSibling).toHaveTextContent('-R$ 600,00')
    expect(within(conjunta).getByText('Saldo previsto', { selector: 'p' }).nextElementSibling).toHaveTextContent('-R$ 1.900,00')
  })

  it('mostra um card por dono, incluindo o casal (CA-5.03)', async () => {
    simularApi({ 'GET /api/balanco': json(BALANCO) })
    renderizarApp('/controle/balanco')
    await screen.findByRole('heading', { name: 'Total do mês' })

    const ana = secao('Ana')
    expect(valorDe(ana, 'Entradas', 'Realizado')).toBe('+R$ 6.000,00')
    expect(valorDe(ana, 'Saídas', 'Realizado')).toBe('-R$ 200,00')
    const bruno = secao('Bruno')
    expect(valorDe(bruno, 'Entradas', 'Previsto')).toBe('+R$ 4.000,00')
    expect(valorDe(bruno, 'Saídas', 'Previsto')).toBe('R$ 0,00')
    const casal = secao('Casal')
    expect(valorDe(casal, 'Entradas', 'Previsto')).toBe('R$ 0,00')
    expect(valorDe(casal, 'Saídas', 'Previsto')).toBe('-R$ 2.800,00')
  })

  it('trocar o mês no seletor consulta o balanço do novo mês', async () => {
    const api = simularApi({
      'GET /api/balanco': ({ params }) => json({ ...BALANCO, mes: params.mes }),
    })
    const { user } = renderizarApp('/controle/balanco')
    await screen.findByRole('heading', { name: 'Total do mês' })
    await user.click(screen.getByRole('button', { name: 'mês anterior' }))
    await screen.findByText('setembro de 2026')
    await expect.poll(() => api.chamadasDe('GET /api/balanco').map((c) => c.params.mes)).toContain('2026-09')
  })

  it('usa o mês da URL quando informado', async () => {
    const api = simularApi({ 'GET /api/balanco': json({ ...BALANCO, mes: '2026-08' }) })
    renderizarApp('/controle/balanco?mes=2026-08')
    await screen.findByRole('heading', { name: 'Total do mês' })
    expect(api.chamadasDe('GET /api/balanco')[0]!.params.mes).toBe('2026-08')
  })

  it('o link "Controle" volta ao Controle preservando o mês', async () => {
    simularApi({
      'GET /api/balanco': json(BALANCO),
      'GET /api/controle/lista': json({
        mes: '2026-08',
        filtros_ativos: false,
        resumo: { entradas: par('0.00', '0.00'), saidas: par('0.00', '0.00'), saldo: par('0.00', '0.00'), saldo_atual_total: '0.00' },
        dias: [],
      }),
    })
    const { user } = renderizarApp('/controle/balanco?mes=2026-08')
    await screen.findByRole('heading', { name: 'Total do mês' })
    await user.click(within(screen.getByRole('main')).getByRole('link', { name: 'Controle' }))
    expect(await screen.findByRole('heading', { name: 'Controle' })).toBeInTheDocument()
    expect(screen.getByText('agosto de 2026')).toBeInTheDocument()
  })

  it('erro da API aparece como alerta e nenhum card é mostrado', async () => {
    simularApi({ 'GET /api/balanco': erroApi(400, 'VALIDACAO', 'Mês inválido.') })
    renderizarApp('/controle/balanco')
    expect(await screen.findByRole('alert')).toHaveTextContent('Mês inválido.')
    expect(screen.queryByRole('heading', { name: 'Total do mês' })).toBeNull()
  })

  it('mês sem lançamentos mostra os cards com zeros', async () => {
    const vazio: BalancoMes = {
      mes: '2026-10',
      total: { entradas: ZERO, saidas: ZERO, saldo: ZERO },
      contas: [],
      donos: [],
    }
    simularApi({ 'GET /api/balanco': json(vazio) })
    renderizarApp('/controle/balanco')
    const total = (await screen.findByRole('heading', { name: 'Total do mês' })).closest('section') as HTMLElement
    expect(valorDe(total, 'Saldo do mês', 'Previsto')).toBe('R$ 0,00')
    expect(valorDe(total, 'Entradas', 'Realizado')).toBe('R$ 0,00')
  })
})
