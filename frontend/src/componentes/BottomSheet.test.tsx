import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { BottomSheet } from './BottomSheet'

afterEach(cleanup)

function Host({ aoFecharSpy }: { aoFecharSpy?: () => void }) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button onClick={() => setAberto(true)}>Abrir</button>
      {aberto && (
        <BottomSheet
          titulo="Meu sheet"
          aoFechar={() => {
            aoFecharSpy?.()
            setAberto(false)
          }}
          rodape={<span>Rodapé</span>}
        >
          <button>Interno</button>
        </BottomSheet>
      )}
    </>
  )
}

describe('BottomSheet (F4h)', () => {
  it('fechado não renderiza o diálogo', () => {
    render(<Host />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('aberto expõe role=dialog, aria-modal, título, conteúdo e rodapé', async () => {
    render(<Host />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    const dialog = screen.getByRole('dialog', { name: 'Meu sheet' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'Interno' })).toBeInTheDocument()
    expect(screen.getByText('Rodapé')).toBeInTheDocument()
  })

  it('leva o foco ao diálogo ao abrir', async () => {
    render(<Host />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(screen.getByRole('dialog')).toHaveFocus()
  })

  it('Esc chama aoFechar e fecha', async () => {
    const spy = vi.fn()
    render(<Host aoFecharSpy={spy} />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    await userEvent.keyboard('{Escape}')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('o botão Fechar chama aoFechar', async () => {
    const spy = vi.fn()
    render(<Host aoFecharSpy={spy} />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('o foco volta ao disparador ao fechar', async () => {
    render(<Host />)
    const disparador = screen.getByRole('button', { name: 'Abrir' })
    await userEvent.click(disparador)
    await userEvent.keyboard('{Escape}')
    expect(disparador).toHaveFocus()
  })

  it('trava a rolagem do corpo enquanto aberto e a restaura ao fechar', async () => {
    render(<Host />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(document.body.style.overflow).toBe('hidden')
    await userEvent.keyboard('{Escape}')
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('Tab no último elemento focável volta ao primeiro (armadilha de foco)', async () => {
    render(<Host />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    const fechar = screen.getByRole('button', { name: 'Fechar' })
    const interno = screen.getByRole('button', { name: 'Interno' })
    interno.focus()
    await userEvent.tab()
    expect(fechar).toHaveFocus()
  })
})
