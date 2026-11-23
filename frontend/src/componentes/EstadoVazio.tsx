import { Inbox, type LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { IconeQuadrado } from './IconeQuadrado'

type EstadoVazioProps = {
  frase: string
  acaoRotulo?: string
  onAcao?: () => void
  icone?: LucideIcon
  compacto?: boolean
}

export function EstadoVazio({
  frase,
  acaoRotulo,
  onAcao,
  icone: Icone = Inbox,
  compacto = false,
}: EstadoVazioProps) {
  if (compacto) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-4 text-center">
        <IconeQuadrado icone={Icone} />
        <p className="text-14 text-muted-foreground">{frase}</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-8 text-center">
      <div aria-hidden="true" className="flex size-32 items-center justify-center rounded-full bg-primary-suave">
        <div className="flex size-24 items-center justify-center rounded-full bg-card">
          <div className="flex size-14 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Icone className="size-7" />
          </div>
        </div>
      </div>
      <p className="text-14 text-muted-foreground">{frase}</p>
      {acaoRotulo && onAcao && <Button onClick={onAcao}>{acaoRotulo}</Button>}
    </div>
  )
}
