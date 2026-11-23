import { useEffect, useEffectEvent } from 'react'

// Contador de IDs: cada camada tem um ID único para distinguir entradas no histórico.
let proximoId = 0
// Timeout pendente: quando uma camada fecha, o back é adiado para permitir que
// a próxima camada registre sua entrada no mesmo commit de limpeza.
let voltaPendente: ReturnType<typeof setTimeout> | null = null

// Voltar do navegador fecha o elemento: cria uma entrada no histórico e a remove ao desmontar.
export function useFecharComVoltar(aoFechar: () => void) {
  const fechar = useEffectEvent(aoFechar)

  useEffect(() => {
    const id = ++proximoId

    // Se há um back pendente, a camada anterior está se limpando. Cancela o timeout
    // e reusa a entrada com replaceState em vez de pushState, impedindo múltiplas
    // entradas quando uma camada abre logo após outra fechar.
    if (voltaPendente !== null) {
      clearTimeout(voltaPendente)
      voltaPendente = null
      history.replaceState({ bottomSheet: id }, '')
    } else {
      history.pushState({ bottomSheet: id }, '')
    }

    function aoVoltar(e: PopStateEvent) {
      // Fecha apenas se o ID mudou (voltar para uma entrada sem ID ou com ID diferente).
      if (e.state?.bottomSheet !== id) fechar()
    }

    window.addEventListener('popstate', aoVoltar)
    return () => {
      window.removeEventListener('popstate', aoVoltar)
      // Fechado por botão ou Esc, a entrada ainda está no histórico. O back é adiado
      // com timeout 0 para garantir que a próxima camada registre sua entrada antes.
      // A checagem dentro do timeout evita desfazer uma navegação já feita no mesmo tick.
      if (history.state?.bottomSheet === id) {
        voltaPendente = setTimeout(() => {
          voltaPendente = null
          if (history.state?.bottomSheet === id) history.back()
        }, 0)
      }
    }
  }, [])
}
