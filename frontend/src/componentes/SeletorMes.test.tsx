import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { SeletorMes } from './SeletorMes'

afterEach(cleanup)

describe('SeletorMes (F4d)', () => {
  it('mostra o rótulo do mês por extenso', () => {
    render(<SeletorMes mes="2026-10" onMudar={() => {}} />)
    expect(screen.getByText('outubro de 2026')).toBeInTheDocument()
  })

  it('mês anterior chama onMudar com o mês anterior', async () => {
    const onMudar = vi.fn()
    render(<SeletorMes mes="2026-10" onMudar={onMudar} />)
    await userEvent.click(screen.getByRole('button', { name: 'mês anterior' }))
    expect(onMudar).toHaveBeenCalledWith('2026-09')
  })

  it('mês seguinte chama onMudar com o mês seguinte', async () => {
    const onMudar = vi.fn()
    render(<SeletorMes mes="2026-10" onMudar={onMudar} />)
    await userEvent.click(screen.getByRole('button', { name: 'mês seguinte' }))
    expect(onMudar).toHaveBeenCalledWith('2026-11')
  })

  it('anterior em janeiro volta ao dezembro do ano anterior', async () => {
    const onMudar = vi.fn()
    render(<SeletorMes mes="2026-01" onMudar={onMudar} />)
    await userEvent.click(screen.getByRole('button', { name: 'mês anterior' }))
    expect(onMudar).toHaveBeenCalledWith('2025-12')
  })

  it('seguinte em dezembro avança para janeiro do ano seguinte', async () => {
    const onMudar = vi.fn()
    render(<SeletorMes mes="2026-12" onMudar={onMudar} />)
    await userEvent.click(screen.getByRole('button', { name: 'mês seguinte' }))
    expect(onMudar).toHaveBeenCalledWith('2027-01')
  })

  it('mes vazio não renderiza nada', () => {
    const { container } = render(<SeletorMes mes="" onMudar={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
