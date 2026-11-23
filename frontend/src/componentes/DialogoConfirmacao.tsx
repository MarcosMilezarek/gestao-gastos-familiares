import { useEffect, useEffectEvent } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogIcone,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type Props = {
  titulo: string
  texto: string
  rotuloAcao: string
  onConfirmar: () => void
  onCancelar: () => void
  destrutivo?: boolean
}

// Confirmação genérica: foco, Esc e aria-modal vêm do AlertDialog (Radix).
export function DialogoConfirmacao({
  titulo,
  texto,
  rotuloAcao,
  onConfirmar,
  onCancelar,
  destrutivo = false,
}: Props) {
  const cancelar = useEffectEvent(onCancelar)

  useEffect(() => {
    history.pushState({ bottomSheet: true }, '')

    // Voltar do navegador sai da entrada criada acima: cancela.
    function aoVoltar(e: PopStateEvent) {
      if (!e.state?.bottomSheet) cancelar()
    }

    window.addEventListener('popstate', aoVoltar)
    return () => {
      window.removeEventListener('popstate', aoVoltar)
      // Fechado por botão ou Esc, a entrada ainda está no histórico: remove-a.
      if (history.state?.bottomSheet) history.back()
    }
  }, [])

  return (
    <AlertDialog open onOpenChange={(aberto) => !aberto && onCancelar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogIcone destrutivo={destrutivo} />
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{texto}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            destrutivo={destrutivo}
            onClick={(e) => {
              e.preventDefault()
              onConfirmar()
            }}
          >
            {rotuloAcao}
          </AlertDialogAction>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
