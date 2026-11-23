import { useEffect, useEffectEvent, type ReactNode } from 'react'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

type Props = {
  titulo: string
  aoFechar: () => void
  rodape?: ReactNode
  children: ReactNode
}

// Foco, Esc, aria-modal e trava de rolagem vêm do Sheet (Radix).
export function BottomSheet({ titulo, aoFechar, rodape, children }: Props) {
  const fechar = useEffectEvent(aoFechar)

  useEffect(() => {
    history.pushState({ bottomSheet: true }, '')

    // Voltar do navegador sai da entrada criada acima: fecha o sheet.
    function aoVoltar(e: PopStateEvent) {
      if (!e.state?.bottomSheet) fechar()
    }

    window.addEventListener('popstate', aoVoltar)
    return () => {
      window.removeEventListener('popstate', aoVoltar)
      // Fechado por botão ou Esc, a entrada ainda está no histórico: remove-a.
      if (history.state?.bottomSheet) history.back()
    }
  }, [])

  return (
    <Sheet open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <SheetContent aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{titulo}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">{children}</div>
        {rodape && <SheetFooter>{rodape}</SheetFooter>}
      </SheetContent>
    </Sheet>
  )
}
