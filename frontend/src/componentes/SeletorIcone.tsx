import type { CSSProperties } from 'react'
import { NOMES_ICONES, iconeDe, rotuloIcone, type NomeIcone } from './icones'

type Props = { valor: string; onChange(nome: NomeIcone): void }

const grade: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--espaco-2)',
}

// Controlado: `valor` é o nome salvo; a opção escolhida fica "pressionada" e com borda mais grossa (não só cor).
export function SeletorIcone({ valor, onChange }: Props) {
  return (
    <div role="group" aria-label="Ícone" style={grade}>
      {NOMES_ICONES.map((nome) => {
        const Icone = iconeDe(nome)
        const selecionado = nome === valor
        return (
          <button
            key={nome}
            type="button"
            className="alvo-toque"
            aria-label={rotuloIcone(nome)}
            aria-pressed={selecionado}
            onClick={() => onChange(nome)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              borderRadius: 'var(--raio)',
              border: `${selecionado ? 2 : 1}px solid ${selecionado ? 'var(--cor-primaria)' : 'var(--cor-borda)'}`,
              background: selecionado ? 'var(--cor-superficie)' : 'transparent',
              color: 'var(--cor-texto)',
              cursor: 'pointer',
            }}
          >
            <Icone aria-hidden="true" size={24} />
          </button>
        )
      })}
    </div>
  )
}
