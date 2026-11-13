import { Check } from 'lucide-react'
import type { CSSProperties } from 'react'

// Paleta fixa de 13 cores (#RRGGBB), com nome em pt-BR para o nome acessível.
// `visto` é a cor do visto sobre a própria cor (escuro onde o branco tem pouco contraste).
const PALETA = [
  { hex: '#6D4C41', nome: 'marrom', visto: '#FFFFFF' },
  { hex: '#1E88E5', nome: 'azul', visto: '#FFFFFF' },
  { hex: '#E65100', nome: 'laranja', visto: '#FFFFFF' },
  { hex: '#00897B', nome: 'verde-água', visto: '#FFFFFF' },
  { hex: '#757575', nome: 'cinza', visto: '#FFFFFF' },
  { hex: '#2E7D32', nome: 'verde', visto: '#FFFFFF' },
  { hex: '#E53935', nome: 'vermelho', visto: '#FFFFFF' },
  { hex: '#8E24AA', nome: 'roxo', visto: '#FFFFFF' },
  { hex: '#D81B60', nome: 'rosa', visto: '#FFFFFF' },
  { hex: '#3949AB', nome: 'índigo', visto: '#FFFFFF' },
  { hex: '#00838F', nome: 'ciano', visto: '#FFFFFF' },
  { hex: '#455A64', nome: 'azul-acinzentado', visto: '#FFFFFF' },
  { hex: '#F9A825', nome: 'amarelo', visto: '#212121' },
] as const

type Props = { valor: string; onChange(cor: string): void }

const grade: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--espaco-2)',
}

// Controlado: a cor escolhida recebe um "visto" (não só cor) e fica "pressionada".
export function SeletorCor({ valor, onChange }: Props) {
  return (
    <div role="group" aria-label="Cor" style={grade}>
      {PALETA.map(({ hex, nome, visto }) => {
        const selecionado = hex === valor
        return (
          <button
            key={hex}
            type="button"
            className="alvo-toque"
            aria-label={`cor ${nome}`}
            aria-pressed={selecionado}
            onClick={() => onChange(hex)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              borderRadius: '50%',
              border: '2px solid var(--cor-texto-suave)',
              background: hex,
              color: visto,
              cursor: 'pointer',
            }}
          >
            {selecionado && <Check aria-hidden="true" size={20} strokeWidth={3} />}
          </button>
        )
      })}
    </div>
  )
}
