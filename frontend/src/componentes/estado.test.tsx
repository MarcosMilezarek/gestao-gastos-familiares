import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { CardsResumo } from './CardsResumo'
import { EstadoVazio } from './EstadoVazio'
import { SituacaoIcone } from './SituacaoIcone'

afterEach(cleanup)

describe('SituacaoIcone (F4f)', () => {
  it.each([
    ['confirmada', 'Confirmada'],
    ['prevista', 'Prevista'],
    ['atrasada', 'Atrasada'],
  ] as const)('situação %s mostra o texto "%s"', (situacao, texto) => {
    render(<SituacaoIcone situacao={situacao} />)
    expect(screen.getByText(texto)).toBeInTheDocument()
  })

  it('o ícone é decorativo (aria-hidden)', () => {
    const { container } = render(<SituacaoIcone situacao="prevista" />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('atrasada difere das demais no ícone', () => {
    const svg = (s: 'confirmada' | 'prevista' | 'atrasada') => {
      const { container, unmount } = render(<SituacaoIcone situacao={s} />)
      const html = container.querySelector('svg')?.innerHTML
      unmount()
      return html
    }
    expect(svg('atrasada')).not.toBe(svg('confirmada'))
    expect(svg('atrasada')).not.toBe(svg('prevista'))
  })
})

describe('EstadoVazio (F4f)', () => {
  it('mostra a frase e nenhum botão sem acaoRotulo', () => {
    render(<EstadoVazio frase="Nada por aqui." />)
    expect(screen.getByText('Nada por aqui.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('não mostra botão com acaoRotulo mas sem onAcao', () => {
    render(<EstadoVazio frase="Nada." acaoRotulo="Criar" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('mostra o botão e chama onAcao ao clicar', async () => {
    const onAcao = vi.fn()
    render(<EstadoVazio frase="Nada." acaoRotulo="Criar" onAcao={onAcao} />)
    await userEvent.click(screen.getByRole('button', { name: 'Criar' }))
    expect(onAcao).toHaveBeenCalledTimes(1)
  })
})

describe('CardsResumo (F4g)', () => {
  it('renderiza todos os filhos dentro de um único contêiner', () => {
    const { container } = render(
      <CardsResumo>
        <div>A</div>
        <div>B</div>
        <div>C</div>
      </CardsResumo>,
    )
    const conteiner = container.firstElementChild as HTMLElement
    expect(conteiner.children).toHaveLength(3)
    expect(conteiner).toHaveTextContent('ABC')
  })
})
