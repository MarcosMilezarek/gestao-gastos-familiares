import { useState } from 'react'
import { NavLink } from 'react-router'
import { CalendarDays, ChartColumn, CreditCard, House, Plus, Target, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MenuMais } from './MenuMais'

const ABAS: { para: string; rotulo: string; icone: LucideIcon; fim?: boolean }[] = [
  { para: '/', rotulo: 'Início', icone: House, fim: true },
  { para: '/controle', rotulo: 'Controle', icone: ChartColumn },
  { para: '/cartoes', rotulo: 'Cartões', icone: CreditCard },
  { para: '/metas', rotulo: 'Metas', icone: Target },
  { para: '/planejamento', rotulo: 'Planejamento', icone: CalendarDays },
]

export function BarraInferior() {
  const [menuAberto, setMenuAberto] = useState(false)

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
        <div className="mx-auto flex max-w-160 flex-col items-center gap-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Button
            type="button"
            size="icon"
            aria-label="Novo lançamento"
            aria-haspopup="dialog"
            className="pointer-events-auto size-14 ring-4 ring-background"
            onClick={() => setMenuAberto(true)}
          >
            <Plus aria-hidden="true" className="size-6" />
          </Button>
          <nav
            aria-label="Principal"
            className="pointer-events-auto flex h-15 w-[calc(100%-2rem)] items-center justify-between rounded-full border bg-card px-1 shadow-barra"
          >
            {ABAS.map(({ para, rotulo, icone: Icone, fim }) => (
              <NavLink
                key={para}
                to={para}
                end={fim}
                className={({ isActive }) =>
                  cn(
                    'flex h-12 items-center justify-center rounded-full text-13 font-semibold no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive
                      ? 'gap-2 bg-primary px-4 text-primary-foreground'
                      : 'w-11 text-muted-foreground',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icone aria-hidden="true" className="size-5" />
                    <span className={cn(!isActive && 'sr-only')}>{rotulo}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
      {menuAberto && <MenuMais aoFechar={() => setMenuAberto(false)} />}
    </>
  )
}
