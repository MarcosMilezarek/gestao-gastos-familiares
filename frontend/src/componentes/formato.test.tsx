import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { Campo } from './Campo'
import { Dinheiro } from './Dinheiro'

afterEach(cleanup)

describe('Campo (F4e)', () => {
  it('liga o label ao controle filho', () => {
    render(
      <Campo rotulo="Nome">
        <input />
      </Campo>,
    )
    expect(screen.getByLabelText('Nome')).toBeInstanceOf(HTMLInputElement)
  })

  it('preserva o id do filho', () => {
    render(
      <Campo rotulo="Nome">
        <input id="meu-id" />
      </Campo>,
    )
    expect(screen.getByLabelText('Nome')).toHaveAttribute('id', 'meu-id')
  })

  it('sem erro nem ajuda não marca aria-invalid nem aria-describedby', () => {
    render(
      <Campo rotulo="Nome">
        <input />
      </Campo>,
    )
    const campo = screen.getByLabelText('Nome')
    expect(campo).not.toHaveAttribute('aria-invalid')
    expect(campo).not.toHaveAttribute('aria-describedby')
  })

  it('com erro mostra a mensagem, liga por aria-describedby e marca aria-invalid', () => {
    render(
      <Campo rotulo="Nome" erro="Campo obrigatório">
        <input />
      </Campo>,
    )
    const campo = screen.getByLabelText('Nome')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(campo).toHaveAccessibleDescription('Campo obrigatório')
  })

  it('com ajuda e sem erro descreve o campo mas não marca aria-invalid', () => {
    render(
      <Campo rotulo="Nome" ajuda="Como no documento">
        <input />
      </Campo>,
    )
    const campo = screen.getByLabelText('Nome')
    expect(campo).toHaveAccessibleDescription('Como no documento')
    expect(campo).not.toHaveAttribute('aria-invalid')
  })

  it('o erro tem precedência sobre a ajuda', () => {
    render(
      <Campo rotulo="Nome" erro="Inválido" ajuda="Dica">
        <input />
      </Campo>,
    )
    expect(screen.getByLabelText('Nome')).toHaveAccessibleDescription('Inválido')
    expect(screen.queryByText('Dica')).toBeNull()
  })

  it('concatena o aria-describedby do filho com o da mensagem', () => {
    render(
      <>
        <p id="externo">Texto externo</p>
        <Campo rotulo="Nome" erro="Inválido">
          <input aria-describedby="externo" />
        </Campo>
      </>,
    )
    const campo = screen.getByLabelText('Nome')
    expect(campo.getAttribute('aria-describedby')).toMatch(/^externo \S+$/)
    expect(campo).toHaveAccessibleDescription('Texto externo Inválido')
  })
})

describe('Dinheiro (F4e)', () => {
  it('formata com formatarBRL', () => {
    render(<Dinheiro valor="1234.5" />)
    expect(screen.getByText(/R\$\s?1\.234,50/)).toBeInTheDocument()
  })

  it('entrada leva sinal "+"', () => {
    const { container } = render(<Dinheiro valor="10.00" tipo="entrada" />)
    expect(container.textContent).toMatch(/^\+R\$\s?10,00$/)
  })

  it('saída leva sinal "-"', () => {
    const { container } = render(<Dinheiro valor="10.00" tipo="saida" />)
    expect(container.textContent).toMatch(/^-R\$\s?10,00$/)
  })

  it('neutro (padrão) não leva sinal', () => {
    const { container } = render(<Dinheiro valor="10.00" />)
    expect(container.textContent).toMatch(/^R\$\s?10,00$/)
  })

  it('zero não leva sinal mesmo em entrada ou saída', () => {
    const { container: a } = render(<Dinheiro valor="0.00" tipo="entrada" />)
    const { container: b } = render(<Dinheiro valor="0.00" tipo="saida" />)
    expect(a.textContent).toMatch(/^R\$/)
    expect(b.textContent).toMatch(/^R\$/)
  })

  it('valor já negativo não duplica o sinal', () => {
    const { container } = render(<Dinheiro valor="-10.00" tipo="saida" />)
    expect(container.textContent).not.toMatch(/--|\+-|-\+/)
    expect(container.textContent).toMatch(/-/)
  })
})
