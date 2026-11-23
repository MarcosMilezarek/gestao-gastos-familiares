import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'

type Props = { titulo: string; voltarPara?: string; acao?: ReactNode }

export function CabecalhoTela({ titulo, voltarPara, acao }: Props) {
  if (voltarPara !== undefined) {
    return (
      <header className="flex h-11 items-center gap-2">
        <Button asChild variant="secondary" size="icon">
          <Link to={voltarPara} aria-label="Voltar">
            <ChevronLeft aria-hidden="true" />
          </Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-center text-18 font-semibold">
          {titulo}
        </h1>
        <div className="flex min-w-11 justify-end">{acao}</div>
      </header>
    )
  }

  return (
    <header className="flex h-11 items-center justify-between gap-2">
      <h1 className="min-w-0 flex-1 truncate text-22 font-bold">{titulo}</h1>
      {acao}
    </header>
  )
}
