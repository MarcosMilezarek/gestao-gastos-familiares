import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router'
import { FormulariosProvider, useFormularios } from '../formularios/FormulariosProvider'
import { BarraInferior } from './BarraInferior'
import { MenuMais } from './MenuMais'

afterEach(cleanup)

function Sonda() {
  const { estado } = useFormularios()
  return <output data-testid="tipo">{String(estado.tipo)}</output>
}

function renderBarra(rota: string) {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <FormulariosProvider>
        <BarraInferior />
        <Sonda />
      </FormulariosProvider>
    </MemoryRouter>,
  )
}

describe('BarraInferior (F4i)', () => {
  it('tem 5 links com os destinos das abas', () => {
    renderBarra('/')
    const links = within(screen.getByRole('navigation', { name: 'Principal' })).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/',
      '/controle',
      '/cartoes',
      '/metas',
      '/planejamento',
    ])
    expect(links.map((l) => l.textContent)).toEqual([
      'Início',
      'Controle',
      'Cartões',
      'Metas',
      'Planejamento',
    ])
  })

  it('marca aria-current só na aba da rota ativa', () => {
    renderBarra('/cartoes')
    const atuais = screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(atuais).toHaveLength(1)
    expect(atuais[0]).toHaveTextContent('Cartões')
  })

  it('subrota mantém a aba pai ativa; Início só é ativa em "/"', () => {
    renderBarra('/controle/contas')
    expect(screen.getByRole('link', { name: 'Controle' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Início' })).not.toHaveAttribute('aria-current')
  })

  it('tocar em uma aba navega e troca a aba ativa', async () => {
    renderBarra('/')
    await userEvent.click(screen.getByRole('link', { name: 'Metas' }))
    expect(screen.getByRole('link', { name: 'Metas' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Início' })).not.toHaveAttribute('aria-current')
  })

  it('o botão "+" abre o menu Novo lançamento', async () => {
    renderBarra('/')
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Novo lançamento' }))
    expect(screen.getByRole('dialog', { name: 'Novo lançamento' })).toBeInTheDocument()
  })
})

describe('MenuMais (F4i)', () => {
  it('mostra exatamente as 4 opções', async () => {
    renderBarra('/')
    await userEvent.click(screen.getByRole('button', { name: 'Novo lançamento' }))
    const dialog = screen.getByRole('dialog')
    const rotulos = within(dialog)
      .getAllByRole('button')
      .map((b) => b.textContent)
      .filter((t) => t !== '')
    expect(rotulos).toEqual(['Despesa', 'Receita', 'Despesa no cartão', 'Aporte/Transferência'])
  })

  it.each([
    ['Despesa', 'despesa'],
    ['Receita', 'receita'],
    ['Despesa no cartão', 'cartao'],
    ['Aporte/Transferência', 'transferencia'],
  ])('a opção "%s" chama abrir("%s") e fecha o menu', async (rotulo, tipo) => {
    renderBarra('/')
    await userEvent.click(screen.getByRole('button', { name: 'Novo lançamento' }))
    await userEvent.click(screen.getByRole('button', { name: rotulo }))
    expect(screen.getByTestId('tipo')).toHaveTextContent(tipo)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renderizado sozinho chama aoFechar após escolher a opção', async () => {
    let fechou = 0
    render(
      <FormulariosProvider>
        <MenuMais aoFechar={() => fechou++} />
      </FormulariosProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Receita' }))
    expect(fechou).toBe(1)
  })
})
