import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { FormulariosProvider, useFormularios } from './FormulariosProvider'

afterEach(cleanup)

function Sonda() {
  const { estado, abrir, fechar } = useFormularios()
  return (
    <>
      <output data-testid="estado">{JSON.stringify(estado)}</output>
      <button onClick={() => abrir('despesa')}>abrir simples</button>
      <button onClick={() => abrir('receita', { valor: '10.00' })}>abrir com valores</button>
      <button onClick={() => fechar()}>fechar</button>
    </>
  )
}

const lerEstado = () => JSON.parse(screen.getByTestId('estado').textContent ?? '')

describe('FormulariosProvider (F4h)', () => {
  it('começa fechado (tipo null)', () => {
    render(
      <FormulariosProvider>
        <Sonda />
      </FormulariosProvider>,
    )
    expect(lerEstado()).toEqual({ tipo: null })
  })

  it('abrir(tipo) define o tipo', async () => {
    render(
      <FormulariosProvider>
        <Sonda />
      </FormulariosProvider>,
    )
    await userEvent.click(screen.getByText('abrir simples'))
    expect(lerEstado().tipo).toBe('despesa')
  })

  it('abrir(tipo, valoresIniciais) guarda os valores iniciais', async () => {
    render(
      <FormulariosProvider>
        <Sonda />
      </FormulariosProvider>,
    )
    await userEvent.click(screen.getByText('abrir com valores'))
    expect(lerEstado()).toEqual({ tipo: 'receita', valoresIniciais: { valor: '10.00' } })
  })

  it('fechar() volta ao estado fechado', async () => {
    render(
      <FormulariosProvider>
        <Sonda />
      </FormulariosProvider>,
    )
    await userEvent.click(screen.getByText('abrir com valores'))
    await userEvent.click(screen.getByText('fechar'))
    expect(lerEstado()).toEqual({ tipo: null })
  })

  it('useFormularios fora do provider lança erro', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Sonda />)).toThrow(
      'useFormularios deve ser usado dentro de FormulariosProvider',
    )
    erro.mockRestore()
  })
})
