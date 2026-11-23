import { useEffect, useEffectEvent } from 'react'

// Voltar do navegador fecha o elemento: cria uma entrada no histórico e a remove ao desmontar.
export function useFecharComVoltar(aoFechar: () => void) {
  const fechar = useEffectEvent(aoFechar)

  useEffect(() => {
    history.pushState({ bottomSheet: true }, '')

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
}
