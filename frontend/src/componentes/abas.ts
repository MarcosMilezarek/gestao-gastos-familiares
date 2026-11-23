import { CalendarDays, ChartColumn, CreditCard, House, Target, type LucideIcon } from 'lucide-react'

export const ABAS: { para: string; rotulo: string; icone: LucideIcon; fim?: boolean }[] = [
  { para: '/', rotulo: 'Início', icone: House, fim: true },
  { para: '/controle', rotulo: 'Controle', icone: ChartColumn },
  { para: '/cartoes', rotulo: 'Cartões', icone: CreditCard },
  { para: '/metas', rotulo: 'Metas', icone: Target },
  { para: '/planejamento', rotulo: 'Planejamento', icone: CalendarDays },
]
