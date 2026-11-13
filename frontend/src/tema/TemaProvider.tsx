import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useSessao } from '../hooks/useSessao'

export type Tema = 'claro' | 'escuro'

type ValorTema = { tema: Tema; aplicar(t: Tema): void }

// A escolha vale só para o usuário que a fez (usuarioId); trocado ou fora da sessão, volta o tema do perfil.
type Escolha = { usuarioId: number | null; tema: Tema }

const TemaContext = createContext<ValorTema | null>(null)

function temaDoSistema(): Tema {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro'
}

export function TemaProvider({ children }: { children: ReactNode }) {
  const { data } = useSessao()
  const usuarioId = data?.usuario.id ?? null
  const [escolha, setEscolha] = useState<Escolha | null>(null)
  const escolhido = escolha?.usuarioId === usuarioId ? escolha.tema : null
  const tema = escolhido ?? data?.usuario.tema ?? temaDoSistema()

  useEffect(() => {
    document.documentElement.dataset.tema = tema
  }, [tema])

  const aplicar = (t: Tema) => setEscolha({ usuarioId, tema: t })

  return (
    <TemaContext.Provider value={{ tema, aplicar }}>
      {children}
    </TemaContext.Provider>
  )
}

export function useTema(): ValorTema {
  const valor = useContext(TemaContext)
  if (!valor) throw new Error('useTema deve ser usado dentro de TemaProvider')
  return valor
}
