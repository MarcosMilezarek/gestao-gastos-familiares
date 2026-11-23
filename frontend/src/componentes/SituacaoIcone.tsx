import { CircleCheck, Clock, TriangleAlert, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type Situacao = 'confirmada' | 'prevista' | 'atrasada'

const SITUACOES: Record<Situacao, { rotulo: string; Icone: LucideIcon; classes: string }> = {
  confirmada: { rotulo: 'Confirmada', Icone: CircleCheck, classes: 'text-primary-texto' },
  prevista: { rotulo: 'Prevista', Icone: Clock, classes: 'text-muted-foreground' },
  atrasada: {
    rotulo: 'Atrasada',
    Icone: TriangleAlert,
    classes: 'h-6 rounded-full bg-alerta-suave px-2 text-alerta-texto',
  },
}

export function SituacaoIcone({ situacao }: { situacao: Situacao }) {
  const { rotulo, Icone, classes } = SITUACOES[situacao]
  return (
    <span className={cn('inline-flex items-center gap-1 text-13 font-medium', classes)}>
      <Icone aria-hidden="true" className="size-4" />
      {rotulo}
    </span>
  )
}
