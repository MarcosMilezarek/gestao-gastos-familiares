import { useState } from 'react'
import { NavLink } from 'react-router'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ABAS } from './abas'
import { MenuMais } from './MenuMais'

export function BarraLateral() {
  const [menuAberto, setMenuAberto] = useState(false)

  return (
    <>
      <aside className="flex w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r bg-card p-4">
        <Button
          type="button"
          size="lg"
          aria-haspopup="dialog"
          className="w-full"
          onClick={() => setMenuAberto(true)}
        >
          <Plus aria-hidden="true" className="size-6" />
          Novo lançamento
        </Button>
        <nav aria-label="Principal" className="flex flex-col gap-1">
          {ABAS.map(({ para, rotulo, icone: Icone, fim }) => (
            <NavLink
              key={para}
              to={para}
              end={fim}
              className={({ isActive }) =>
                cn(
                  'flex h-12 items-center gap-3 rounded-full px-4 text-14 no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'bg-primary font-semibold text-primary-foreground'
                    : 'font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              <Icone aria-hidden="true" className="size-5" />
              <span>{rotulo}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      {menuAberto && <MenuMais aoFechar={() => setMenuAberto(false)} />}
    </>
  )
}
