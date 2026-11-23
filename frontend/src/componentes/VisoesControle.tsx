import { NavLink } from 'react-router'

import { cn } from '@/lib/utils'
import { tabsListClasses, tabsTriggerClasses } from '@/components/ui/tabs'

const visoes = [
  { para: '/controle', rotulo: 'Lista', end: true },
  { para: '/controle/balanco', rotulo: 'Balanço', end: false },
  { para: '/controle/proporcao', rotulo: 'Proporção', end: false },
  { para: '/controle/relatorios', rotulo: 'Relatórios', end: false },
]

export function VisoesControle({ mes }: { mes: string }) {
  return (
    <nav aria-label="Visões do controle" className={tabsListClasses}>
      {visoes.map(({ para, rotulo, end }) => (
        <NavLink
          key={para}
          to={`${para}?mes=${mes}`}
          end={end}
          className={({ isActive }) =>
            cn(
              tabsTriggerClasses,
              isActive && 'bg-primary font-semibold text-primary-foreground',
            )
          }
        >
          {rotulo}
        </NavLink>
      ))}
    </nav>
  )
}
