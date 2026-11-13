import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router'
import type { MetaSaida } from '../api/metas'
import { CardMeta } from './CardMeta'

afterEach(cleanup)

function meta(parcial: Partial<MetaSaida> = {}): MetaSaida {
  return {
    id: 5,
    nome: 'Viagem',
    valor_alvo: '10000.00',
    data_alvo: null,
    valor_inicial: '1000.00',
    cor: '#00838F',
    icone: 'plane',
    descricao: null,
    valor_atual: '3300.00',
    aplicado_liquido: '2200.00',
    rendeu: '100.00',
    falta: '6700.00',
    porcentagem: '33.00',
    situacao: 'em_andamento',
    casal_encerrado: false,
    ...parcial,
  }
}

function renderizar(m: MetaSaida) {
  return render(
    <MemoryRouter>
      <CardMeta meta={m} />
    </MemoryRouter>,
  )
}

describe('CardMeta (CA-6.09)', () => {
  it('mostra nome, valor atual, alvo, falta e porcentagem', () => {
    renderizar(meta())
    const link = screen.getByRole('link')
    expect(within(link).getByText('Viagem')).toBeInTheDocument()
    expect(within(link).getByText('Valor atual').nextSibling).toHaveTextContent('R$ 3.300,00')
    expect(within(link).getByText('Alvo').nextSibling).toHaveTextContent('R$ 10.000,00')
    expect(within(link).getByText('Falta').nextSibling).toHaveTextContent('R$ 6.700,00')
    expect(within(link).getByText('33,00%')).toBeInTheDocument()
  })

  it('aponta para o detalhe da meta', () => {
    renderizar(meta({ id: 42 }))
    expect(screen.getByRole('link')).toHaveAttribute('href', '/metas/42')
  })

  it('mostra a data-alvo formatada quando existe', () => {
    renderizar(meta({ data_alvo: '2027-03-15' }))
    expect(screen.getByText('15/03/2027')).toBeInTheDocument()
  })

  it('não mostra data-alvo quando a meta não tem', () => {
    renderizar(meta({ data_alvo: null }))
    expect(screen.queryByText(/Data-alvo/)).not.toBeInTheDocument()
  })

  // O jsdom descarta `width: min(...)` (CSS que ele não entende): só dá para provar que a barra existe,
  // fica escondida de leitores de tela e usa a cor da meta; o limite de 100 % fica para o navegador.
  it('a barra é decorativa, usa a cor da meta e a porcentagem vai em texto (RNF-08)', () => {
    const { container } = renderizar(meta())
    const barra = container.querySelector<HTMLElement>('div[aria-hidden="true"]')
    expect(barra).not.toBeNull()
    expect(barra!.firstElementChild).toHaveStyle({ background: 'rgb(0, 131, 143)' })
    expect(screen.getByText('33,00%')).toBeInTheDocument()
  })

  it('acima de 100 % o texto mostra 110,00 % e a falta é R$ 0,00', () => {
    renderizar(
      meta({ valor_atual: '11000.00', falta: '0.00', porcentagem: '110.00', situacao: 'concluida' }),
    )
    expect(screen.getByText('110,00%')).toBeInTheDocument()
    expect(screen.getByText('Falta').nextSibling).toHaveTextContent('R$ 0,00')
    expect(screen.getByText('Valor atual').nextSibling).toHaveTextContent('R$ 11.000,00')
  })

  it('o ícone decorativo fica escondido de leitores de tela', () => {
    const { container } = renderizar(meta())
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
