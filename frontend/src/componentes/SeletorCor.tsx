import { Check } from 'lucide-react'

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

// Controlado: a cor escolhida recebe um "visto" (não só cor) e fica "pressionada".
export function SeletorCor({ valor, onChange }: Props) {
  return (
    <div role="group" aria-label="Cor" className="flex flex-wrap gap-2">
      {PALETA.map(({ hex, nome, visto }) => {
        const selecionado = hex === valor
        return (
          <button
            key={hex}
            type="button"
            aria-label={`cor ${nome}`}
            aria-pressed={selecionado}
            onClick={() => onChange(hex)}
            style={{ background: hex, color: visto }}
            className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full border-2 border-input p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none aria-pressed:ring-2 aria-pressed:ring-primary aria-pressed:ring-offset-2 aria-pressed:ring-offset-background"
          >
            {selecionado && <Check aria-hidden="true" size={20} strokeWidth={3} />}
          </button>
        )
      })}
    </div>
  )
}
