import { type ReactNode } from 'react'
import { useFecharComVoltar } from '../hooks/useFecharComVoltar'
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
  useFecharComVoltar(aoFechar)

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
