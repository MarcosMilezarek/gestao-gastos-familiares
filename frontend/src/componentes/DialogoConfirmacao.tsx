import { useFecharComVoltar } from '../hooks/useFecharComVoltar'
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
  useFecharComVoltar(onCancelar)

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
