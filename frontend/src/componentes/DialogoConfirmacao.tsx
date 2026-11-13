import { BottomSheet } from './BottomSheet'
import estado from './estado.module.css'

type Props = {
  titulo: string
  texto: string
  rotuloAcao: string
  onConfirmar: () => void
  onCancelar: () => void
}

// Confirmação genérica: foco, Esc e aria-modal vêm do BottomSheet.
export function DialogoConfirmacao({
  titulo,
  texto,
  rotuloAcao,
  onConfirmar,
  onCancelar,
}: Props) {
  return (
    <BottomSheet
      titulo={titulo}
      aoFechar={onCancelar}
      rodape={
        <>
          <button type="button" className={estado.acao} onClick={onCancelar}>
            Cancelar
          </button>
          <button type="button" className={estado.acao} onClick={onConfirmar}>
            {rotuloAcao}
          </button>
        </>
      }
    >
      <p>{texto}</p>
    </BottomSheet>
  )
}
