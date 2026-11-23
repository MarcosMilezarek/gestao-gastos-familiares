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
    <nav aria-label="Visões do controle" className={cn(tabsListClasses, 'md:w-fit')}>
      {visoes.map(({ para, rotulo, end }) => (
        <NavLink
          key={para}
          to={`${para}?mes=${mes}`}
          end={end}
          className={({ isActive }) =>
            cn(
              tabsTriggerClasses,
              'px-1 text-13 md:flex-none md:px-4 md:text-14',
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
