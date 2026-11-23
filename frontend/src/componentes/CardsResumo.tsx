import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { formatarBRL } from '../formatacao/dinheiro'
import { IconeQuadrado } from './IconeQuadrado'

// Faixa com rolagem horizontal só no contêiner (RF-0.04): a página nunca rola de lado.
// A partir de md: vira grade que quebra linha em vez de rolar (§11.7).
export function CardsResumo({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 snap-x snap-proximity gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] md:gap-3 md:overflow-x-visible md:pb-0 [&>*]:w-36 [&>*]:shrink-0 [&>*]:snap-start md:[&>*]:w-auto md:[&>*]:min-w-0">
      {children}
    </div>
  )
}

const tons = {
  neutro: { icone: 'primaria', valor: 'text-foreground' },
  entrada: { icone: 'entrada', valor: 'text-entrada-texto' },
  saida: { icone: 'saida', valor: 'text-saida-texto' },
  alerta: { icone: 'alerta', valor: 'text-alerta-texto' },
} as const

type CardResumoProps = {
  rotulo: string
  valor: string
  apoio?: string
  tom?: keyof typeof tons
  icone?: LucideIcon
  aoAbrir?: () => void
}

export function CardResumo({ rotulo, valor, apoio, tom = 'neutro', icone, aoAbrir }: CardResumoProps) {
  const conteudo = (
    <>
      {icone && <IconeQuadrado icone={icone} tom={tons[tom].icone} tamanho="sm" />}
      <span className="text-13 text-muted-foreground">{rotulo}</span>
      <span className={cn('text-16 font-bold tabular-nums', tons[tom].valor)}>
        {formatarBRL(valor)}
      </span>
      {apoio && <span className="text-13 text-muted-foreground">{apoio}</span>}
    </>
  )
  const classes =
    'flex w-36 flex-col items-start gap-1 rounded-xl border bg-card p-3 text-left shadow-card'

  if (aoAbrir) {
    return (
      <button
        type="button"
        onClick={aoAbrir}
        className={cn(
          classes,
          'min-h-11 ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
      >
        {conteudo}
      </button>
    )
  }
  return <div className={classes}>{conteudo}</div>
}
