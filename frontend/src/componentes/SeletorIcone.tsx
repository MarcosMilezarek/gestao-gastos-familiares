import { Check } from 'lucide-react'
import { NOMES_ICONES, iconeDe, rotuloIcone, type NomeIcone } from './icones'

type Props = { valor: string; onChange(nome: NomeIcone): void }

// Controlado: `valor` é o nome salvo; a opção escolhida fica "pressionada", com borda mais grossa e visto (não só cor).
export function SeletorIcone({ valor, onChange }: Props) {
  return (
    <div role="group" aria-label="Ícone" className="flex flex-wrap gap-2">
      {NOMES_ICONES.map((nome) => {
        const Icone = iconeDe(nome)
        const selecionado = nome === valor
        return (
          <button
            key={nome}
            type="button"
            aria-label={rotuloIcone(nome)}
            aria-pressed={selecionado}
            onClick={() => onChange(nome)}
            className="relative inline-flex size-11 cursor-pointer items-center justify-center rounded-md border bg-card p-0 text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none aria-pressed:border-2 aria-pressed:border-primary aria-pressed:bg-primary-suave aria-pressed:text-primary-texto"
          >
            <Icone aria-hidden="true" size={24} />
            {selecionado && (
              <Check
                aria-hidden="true"
                className="absolute -top-1 -right-1 size-4 rounded-full bg-primary p-0.5 text-primary-foreground"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
