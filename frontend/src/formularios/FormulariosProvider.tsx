import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Alcance } from '../componentes/DialogoAlcance'

export type TipoFormulario = 'despesa' | 'receita' | 'cartao' | 'transferencia'

type Estado = {
  tipo: TipoFormulario | null
  valoresIniciais?: Record<string, unknown>
  aoSalvar?: () => void
  alcance?: Alcance
  preenchimento?: { conta_id: number; conta_destino_id: number }
}

type ValorFormularios = {
  estado: Estado
  abrir(
    tipo: TipoFormulario,
    valoresIniciais?: Record<string, unknown>,
    aoSalvar?: () => void,
    alcance?: Alcance,
    preenchimento?: { conta_id: number; conta_destino_id: number },
  ): void
  fechar(): void
}

const FormulariosContext = createContext<ValorFormularios | null>(null)

const FECHADO: Estado = { tipo: null }

export function FormulariosProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>(FECHADO)

  const valor: ValorFormularios = {
    estado,
    abrir: (tipo, valoresIniciais, aoSalvar, alcance, preenchimento) =>
      setEstado({ tipo, valoresIniciais, aoSalvar, alcance, preenchimento }),
    fechar: () => setEstado(FECHADO),
  }

  return <FormulariosContext.Provider value={valor}>{children}</FormulariosContext.Provider>
}

export function useFormularios(): ValorFormularios {
  const valor = useContext(FormulariosContext)
  if (!valor) throw new Error('useFormularios deve ser usado dentro de FormulariosProvider')
  return valor
}
