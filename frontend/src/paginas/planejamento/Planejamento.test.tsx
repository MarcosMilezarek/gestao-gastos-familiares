import { afterEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { json, limparTudo, renderizarApp, simularApi } from '../../testes/utilitarios'

afterEach(limparTudo)

describe('Planejamento: hub (CA-7.02, CA-0.01)', () => {
  it('mostra exatamente as 3 entradas com os caminhos certos', async () => {
    simularApi({})
    renderizarApp('/planejamento')
    await screen.findByRole('heading', { name: 'Planejamento' })
    const menu = screen.getByRole('navigation', { name: 'Planejamento' })
    const links = within(menu).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Orçamento do mês', 'Cenários', 'Plano de metas'])
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/planejamento/orcamento',
      '/planejamento/cenarios',
      '/planejamento/plano-de-metas',
    ])
  })

  it('tocar em "Orçamento do mês" abre a tela de orçamento', async () => {
    simularApi({ 'GET /api/orcamentos/2026-10': json({ mes: '2026-10', orcamento: null, renda_sugerida: '0.00' }) })
    const { user } = renderizarApp('/planejamento')
    await user.click(await screen.findByRole('link', { name: 'Orçamento do mês' }))
    expect(await screen.findByRole('heading', { name: 'Orçamento' })).toBeInTheDocument()
  })

  it('tocar em "Cenários" abre a lista de cenários', async () => {
    simularApi({ 'GET /api/cenarios': json([]) })
    const { user } = renderizarApp('/planejamento')
    await user.click(await screen.findByRole('link', { name: 'Cenários' }))
    expect(await screen.findByRole('heading', { name: 'Cenários' })).toBeInTheDocument()
  })

  it('tocar em "Plano de metas" abre a tela do plano', async () => {
    simularApi({ 'GET /api/metas': json({ metas: [] }) })
    const { user } = renderizarApp('/planejamento')
    await user.click(await screen.findByRole('link', { name: 'Plano de metas' }))
    expect(await screen.findByRole('heading', { name: 'Plano de metas' })).toBeInTheDocument()
  })

  it('a aba Planejamento da barra inferior abre o hub', async () => {
    simularApi({ 'GET /api/inicio': json({}) })
    const { user } = renderizarApp('/controle/tags')
    const abas = (await screen.findAllByRole('link', { name: 'Planejamento' })).filter(
      (a) => a.getAttribute('href') === '/planejamento',
    )
    await user.click(abas[0]!)
    expect(await screen.findByRole('navigation', { name: 'Planejamento' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cenários' })).toBeInTheDocument()
  })
})
