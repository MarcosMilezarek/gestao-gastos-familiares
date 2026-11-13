import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter, useLocation } from 'react-router'
import { useFiltros } from '../hooks/useFiltros'
import { FiltrosLista, type OpcoesFiltros } from './FiltrosLista'

// O BottomSheet chama history.back() ao desmontar (popstate assíncrono): espera assentar.
afterEach(async () => {
  cleanup()
  await new Promise((r) => setTimeout(r, 20))
})

const OPCOES: OpcoesFiltros = {
  donos: [
    { valor: 1, nome: 'Ana' },
    { valor: 2, nome: 'Bruno' },
    { valor: 'casal', nome: 'Casal' },
  ],
  contas: [
    { valor: 1, nome: 'Conta Ana' },
    { valor: 2, nome: 'Conta Conjunta' },
  ],
  categorias: [
    { valor: 10, nome: 'Gastos variáveis' },
    { valor: 11, nome: 'Gastos variáveis / Mercado' },
  ],
  cartoes: [{ valor: 7, nome: 'Nubank' }],
}

function Harness() {
  const controle = useFiltros()
  const local = useLocation()
  return (
    <>
      <FiltrosLista controle={controle} opcoes={OPCOES} />
      <output data-testid="url">{local.search}</output>
    </>
  )
}

function montar(rota = '/controle?mes=2026-10') {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[rota]}>
      <Harness />
    </MemoryRouter>,
  )
  return { user }
}

const url = () => new URLSearchParams(screen.getByTestId('url').textContent ?? '')

async function abrirSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Filtros' }))
  return screen.findByRole('dialog', { name: 'Filtros' })
}

describe('FiltrosLista (CA-5.08, CA-5.09, CA-5.10, CA-5.13, t185 I1)', () => {
  it('sem filtros não mostra chips removíveis nem "Limpar filtros"; "Todas" está pressionado', () => {
    montar()
    expect(screen.getByRole('button', { name: 'Todas', pressed: true })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Remover filtro/ })).toBeNull()
  })

  it.each([
    ['Despesas', ['despesa_conta', 'despesa_cartao']],
    ['Receitas', ['receita']],
    ['Transferências', ['transferencia', 'aporte']],
  ])('atalho "%s" grava os tipos na URL e fica pressionado', async (rotulo, tipos) => {
    const { user } = montar()
    await user.click(screen.getByRole('button', { name: rotulo }))
    expect(url().getAll('tipo').sort()).toEqual([...tipos].sort())
    expect(url().get('mes')).toBe('2026-10')
    expect(screen.getByRole('button', { name: rotulo, pressed: true })).toBeInTheDocument()
  })

  it('atalho "Todas" tira os tipos da URL', async () => {
    const { user } = montar('/controle?mes=2026-10&tipo=receita')
    expect(screen.getByRole('button', { name: 'Receitas', pressed: true })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Todas' }))
    expect(url().getAll('tipo')).toEqual([])
    expect(url().get('mes')).toBe('2026-10')
  })

  it('tipos que não formam um atalho deixam nenhum atalho pressionado', () => {
    montar('/controle?tipo=aporte')
    for (const nome of ['Todas', 'Despesas', 'Receitas', 'Transferências']) {
      expect(screen.getByRole('button', { name: nome, pressed: false })).toBeInTheDocument()
    }
  })

  it('escolher no sheet não grava na URL até tocar em "Aplicar"; ao aplicar, grava tudo e mostra chips', async () => {
    const { user } = montar()
    const sheet = await abrirSheet(user)
    await user.click(within(sheet).getByLabelText('Ana'))
    await user.click(within(sheet).getByLabelText('Conta Conjunta'))
    await user.click(within(sheet).getByLabelText('Atrasada'))
    await user.click(within(sheet).getByLabelText('Nubank'))
    expect(url().getAll('dono')).toEqual([])
    await user.click(within(sheet).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(url().getAll('dono')).toEqual(['1']))
    expect(url().getAll('conta_id')).toEqual(['2'])
    expect(url().getAll('situacao')).toEqual(['atrasada'])
    expect(url().getAll('cartao_id')).toEqual(['7'])
    expect(url().get('mes')).toBe('2026-10')
    for (const nome of ['Ana', 'Conta Conjunta', 'Atrasada', 'Nubank']) {
      expect(screen.getByRole('button', { name: `Remover filtro ${nome}` })).toBeInTheDocument()
    }
  })

  it('dono = A e dono = casal juntos gravam os dois valores', async () => {
    const { user } = montar()
    const sheet = await abrirSheet(user)
    await user.click(within(sheet).getByLabelText('Ana'))
    await user.click(within(sheet).getByLabelText('Casal'))
    await user.click(within(sheet).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(url().getAll('dono').sort()).toEqual(['1', 'casal']))
  })

  it('categoria-mãe e tipo avançado (aporte, reajuste) são gravados', async () => {
    const { user } = montar()
    const sheet = await abrirSheet(user)
    await user.click(within(sheet).getByLabelText('Gastos variáveis'))
    await user.click(within(sheet).getByLabelText('Aporte'))
    await user.click(within(sheet).getByLabelText('Reajuste de saldo'))
    await user.click(within(sheet).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(url().getAll('categoria_id')).toEqual(['10']))
    expect(url().getAll('tipo').sort()).toEqual(['aporte', 'reajuste'])
  })

  it('ao reabrir o sheet as caixas refletem os filtros da URL', async () => {
    const { user } = montar('/controle?situacao=prevista&dono=casal')
    const sheet = await abrirSheet(user)
    expect(within(sheet).getByLabelText('Prevista')).toBeChecked()
    expect(within(sheet).getByLabelText('Casal')).toBeChecked()
    expect(within(sheet).getByLabelText('Atrasada')).not.toBeChecked()
  })

  it('fechar pelo X descarta as escolhas e não altera a URL', async () => {
    const { user } = montar()
    const sheet = await abrirSheet(user)
    await user.click(within(sheet).getByLabelText('Ana'))
    await user.click(within(sheet).getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(url().getAll('dono')).toEqual([])
    expect(screen.queryByRole('button', { name: /Remover filtro/ })).toBeNull()
    // reabrir começa limpo
    const outra = await abrirSheet(user)
    expect(within(outra).getByLabelText('Ana')).not.toBeChecked()
  })

  it('fechar com Esc descarta as escolhas e não altera a URL', async () => {
    const { user } = montar()
    const sheet = await abrirSheet(user)
    await user.click(within(sheet).getByLabelText('Bruno'))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(url().getAll('dono')).toEqual([])
  })

  it('fechar com Voltar do navegador descarta as escolhas e os filtros anteriores continuam', async () => {
    const { user } = montar('/controle?mes=2026-10&situacao=prevista')
    const sheet = await abrirSheet(user)
    await user.click(within(sheet).getByLabelText('Bruno'))
    window.history.back()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(url().getAll('dono')).toEqual([])
    expect(url().getAll('situacao')).toEqual(['prevista'])
    expect(url().get('mes')).toBe('2026-10')
  })

  it('"Aplicar" com o histórico do sheet pendente grava a URL depois da volta e não a desfaz', async () => {
    const { user } = montar()
    const sheet = await abrirSheet(user)
    expect(window.history.state?.bottomSheet).toBe(true)
    await user.click(within(sheet).getByLabelText('Receita'))
    await user.click(within(sheet).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(url().getAll('tipo')).toEqual(['receita']))
    // Dá tempo para qualquer popstate atrasado desfazer o filtro, se houvesse.
    await new Promise((r) => setTimeout(r, 50))
    expect(url().getAll('tipo')).toEqual(['receita'])
    expect(screen.getByRole('button', { name: 'Receitas', pressed: true })).toBeInTheDocument()
  })

  it('o chip mostra o nome da opção e o X do chip remove só aquele filtro', async () => {
    const { user } = montar('/controle?mes=2026-10&dono=1&situacao=atrasada&situacao=prevista')
    await user.click(screen.getByRole('button', { name: 'Remover filtro Atrasada' }))
    expect(url().getAll('situacao')).toEqual(['prevista'])
    expect(url().getAll('dono')).toEqual(['1'])
    expect(url().get('mes')).toBe('2026-10')
  })

  it('"Limpar filtros" tira todos os filtros e preserva o mês', async () => {
    const { user } = montar('/controle?mes=2026-09&dono=1&conta_id=2&categoria_id=10&tipo=receita&cartao_id=7&situacao=atrasada')
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect([...url().keys()]).toEqual(['mes'])
    expect(url().get('mes')).toBe('2026-09')
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull()
  })

  it('valores inválidos na URL são ignorados', () => {
    montar('/controle?dono=abc&conta_id=0&tipo=xyz&situacao=nada')
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull()
  })

  it('opções vazias de um grupo escondem o grupo no sheet', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <SemCartoes />
      </MemoryRouter>,
    )
    const sheet = await abrirSheet(user)
    expect(within(sheet).queryByText('Cartão')).toBeNull()
    expect(within(sheet).getByText('Conta')).toBeInTheDocument()
  })
})

function SemCartoes() {
  const controle = useFiltros()
  return <FiltrosLista controle={controle} opcoes={{ ...OPCOES, cartoes: [] }} />
}
