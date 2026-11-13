import { useEffect, useEffectEvent, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import styles from './bottomSheet.module.css'

const SELETOR_FOCAVEL =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

type Props = {
  titulo: string
  aoFechar: () => void
  rodape?: ReactNode
  children: ReactNode
}

export function BottomSheet({ titulo, aoFechar, rodape, children }: Props) {
  const tituloId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const fechar = useEffectEvent(aoFechar)

  useEffect(() => {
    const dialog = dialogRef.current
    const focoAnterior = document.activeElement as HTMLElement | null
    const rolagemAnterior = document.body.style.overflow

    document.body.style.overflow = 'hidden'
    dialog?.focus()
    history.pushState({ bottomSheet: true }, '')

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        fechar()
        return
      }
      if (e.key !== 'Tab' || !dialog) return

      const focaveis = dialog.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL)
      const primeiro = focaveis[0]
      const ultimo = focaveis[focaveis.length - 1]
      const ativo = document.activeElement

      if (!primeiro || !ultimo || !dialog.contains(ativo)) {
        e.preventDefault()
        ;(primeiro ?? dialog).focus()
      } else if (e.shiftKey && (ativo === primeiro || ativo === dialog)) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && ativo === ultimo) {
        e.preventDefault()
        primeiro.focus()
      }
    }

    // Voltar do navegador sai da entrada criada acima: fecha o sheet.
    function aoVoltar(e: PopStateEvent) {
      if (!e.state?.bottomSheet) fechar()
    }

    document.addEventListener('keydown', aoTeclar)
    window.addEventListener('popstate', aoVoltar)
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      window.removeEventListener('popstate', aoVoltar)
      document.body.style.overflow = rolagemAnterior
      // Fechado por botão ou Esc, a entrada ainda está no histórico: remove-a.
      if (history.state?.bottomSheet) history.back()
      focoAnterior?.focus()
    }
  }, [])

  return (
    <div className={styles.fundo}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        className={styles.folha}
      >
        <header className={styles.cabecalho}>
          <h2 id={tituloId} className={styles.titulo}>
            {titulo}
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            className={styles.fechar}
            onClick={aoFechar}
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <div className={styles.corpo}>{children}</div>
        {rodape && <footer className={styles.rodape}>{rodape}</footer>}
      </div>
    </div>
  )
}
