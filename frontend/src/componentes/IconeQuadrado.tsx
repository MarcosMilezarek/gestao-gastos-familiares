import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

const tons = {
  primaria: 'bg-primary-suave text-primary-texto',
  entrada: 'bg-entrada-suave text-entrada-texto',
  saida: 'bg-saida-suave text-saida-texto',
  alerta: 'bg-alerta-suave text-alerta-texto',
  info: 'bg-info-suave text-info-texto',
}

const tamanhos = {
  default: 'size-10 rounded-md [&_svg]:size-5',
  sm: 'size-8 rounded-sm [&_svg]:size-4',
}

type Props = {
  icone: LucideIcon
  tom?: keyof typeof tons
  tamanho?: keyof typeof tamanhos
  className?: string
}

export function IconeQuadrado({
  icone: Icone,
  tom = 'primaria',
  tamanho = 'default',
  className,
}: Props) {
  return (
    <div
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        tons[tom],
        tamanhos[tamanho],
        className,
      )}
    >
      <Icone aria-hidden="true" />
    </div>
  )
}
