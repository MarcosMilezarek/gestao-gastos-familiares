import * as React from 'react'
import { ResponsiveContainer, Tooltip, type TooltipContentProps } from 'recharts'

import { cn } from '@/lib/utils'

export type ChartConfig = Record<string, { label: string; color: string }>

// Cada ponto do gráfico leva o número que desenha e o texto já formatado que se mostra.
export type PontoGrafico = { valor: number; texto: string }

function ChartContainer({
  config,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<'div'>, 'children'> & {
  config: ChartConfig
  children: React.ComponentProps<typeof ResponsiveContainer>['children']
}) {
  const cores = Object.fromEntries(Object.entries(config).map(([chave, item]) => [`--color-${chave}`, item.color]))
  return (
    <div
      data-slot="chart"
      style={cores as React.CSSProperties}
      className={cn(
        'flex aspect-video min-w-0 justify-center text-13 tabular-nums',
        '[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none',
        className,
      )}
      {...props}
    >
      <ResponsiveContainer>{children}</ResponsiveContainer>
    </div>
  )
}

const ChartTooltip = Tooltip

// Pílula que inverte nos dois temas (foreground sobre background).
function ChartTooltipContent({ active, payload }: Partial<TooltipContentProps<number, string>>) {
  const primeiro = payload?.[0]
  if (!active || !primeiro) return null
  const ponto = primeiro.payload as Partial<PontoGrafico> | undefined
  return (
    <div
      data-slot="chart-tooltip"
      className="rounded-full bg-foreground px-3 py-1.5 text-13 font-semibold text-background tabular-nums shadow-overlay"
    >
      {ponto?.texto ?? primeiro.value}
    </div>
  )
}

export type ItemLegenda = { nome: string; cor: string; valor?: string; porcentagem?: string }

// Lista em HTML: nome, valor e porcentagem à direita; o estado não depende só da cor.
function ChartLegend({ itens, className }: { itens: ItemLegenda[]; className?: string }) {
  return (
    <ul data-slot="chart-legend" className={cn('flex flex-col gap-2', className)}>
      {itens.map((item) => (
        <li key={item.nome} className="flex min-h-6 items-center gap-2 text-14 text-foreground">
          <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ backgroundColor: item.cor }} />
          <span className="min-w-0 flex-1 truncate">{item.nome}</span>
          {item.valor && <span className="font-semibold tabular-nums">{item.valor}</span>}
          {item.porcentagem && <span className="w-12 text-right text-muted-foreground tabular-nums">{item.porcentagem}</span>}
        </li>
      ))}
    </ul>
  )
}

export { ChartContainer, ChartLegend, ChartTooltip, ChartTooltipContent }
