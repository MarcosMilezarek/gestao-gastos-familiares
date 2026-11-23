import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { mesAnterior, mesSeguinte, rotuloMes } from '../formatacao/data'

type Props = { mes: string; onMudar(m: string): void }

export function SeletorMes({ mes, onMudar }: Props) {
  // Com a sessão ainda não carregada, useMes devolve "" (ver useMes.ts).
  if (mes === '') return null

  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-background py-2">
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label="mês anterior"
        onClick={() => onMudar(mesAnterior(mes))}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <span className="min-w-0 flex-1 text-center text-16 font-semibold">
        {rotuloMes(mes)}
      </span>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label="mês seguinte"
        onClick={() => onMudar(mesSeguinte(mes))}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  )
}
