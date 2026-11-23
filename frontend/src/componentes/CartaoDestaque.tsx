import { formatarBRL } from '../formatacao/dinheiro'

type Chip = { rotulo: string; valor: string }

type CartaoDestaqueProps = {
  rotulo: string
  valor: string
  chips: Chip[]
  anel?: { percentual: string; rotulo: string }
}

const RAIO = 52
const CIRCUNFERENCIA = 2 * Math.PI * RAIO

// Anel de 120 x 120: trilha branca translúcida e arco âmbar; o percentual vem pronto da API.
function Anel({ percentual, rotulo }: { percentual: string; rotulo: string }) {
  const fracao = Math.min(100, Math.max(0, Number(percentual))) / 100
  return (
    <svg
      role="img"
      aria-label={`${rotulo}: ${percentual}%`}
      viewBox="0 0 120 120"
      className="size-24 shrink-0 -rotate-90"
    >
      <circle cx="60" cy="60" r={RAIO} fill="none" strokeWidth="10" className="stroke-branco-18" />
      <circle
        cx="60"
        cy="60"
        r={RAIO}
        fill="none"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={CIRCUNFERENCIA}
        strokeDashoffset={CIRCUNFERENCIA * (1 - fracao)}
        className="stroke-alerta"
      />
    </svg>
  )
}

export function CartaoDestaque({ rotulo, valor, chips, anel }: CartaoDestaqueProps) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-linear-to-bl from-primary-claro to-primary-escuro p-5 text-primary-foreground shadow-destaque">
      <div aria-hidden="true" className="absolute -top-10 -right-8 size-40 rounded-full bg-branco-12" />
      <div aria-hidden="true" className="absolute -bottom-12 -left-10 size-32 rounded-full bg-branco-12" />
      <div className="relative flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-14">{rotulo}</span>
            <span className={anel ? 'text-28 font-bold tabular-nums' : 'text-40 font-bold tabular-nums'}>
              {formatarBRL(valor)}
            </span>
          </div>
          {anel && <Anel percentual={anel.percentual} rotulo={anel.rotulo} />}
        </div>
        {chips.length > 0 && (
          <div className="flex flex-col gap-2">
            {chips.map((chip) => (
              <div
                key={chip.rotulo}
                className="flex items-center justify-between gap-3 rounded-lg bg-branco-18 px-3 py-2"
              >
                <span className="min-w-0 truncate text-13">{chip.rotulo}</span>
                <span className="shrink-0 text-13 font-semibold tabular-nums">{formatarBRL(chip.valor)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
