import { useSyncExternalStore, type ComponentProps } from 'react'
import { Outlet } from 'react-router'
import type { LancamentoSaida } from '../api/lancamentos'
import { FormCompraCartao } from '../formularios/FormCompraCartao'
import { FormDespesaReceita } from '../formularios/FormDespesaReceita'
import { FormTransferencia } from '../formularios/FormTransferencia'
import { FormulariosProvider, useFormularios } from '../formularios/FormulariosProvider'
import { BarraInferior } from './BarraInferior'
import { BarraLateral } from './BarraLateral'

export function Shell() {
  return (
    <FormulariosProvider>
      <Conteudo />
    </FormulariosProvider>
  )
}

// Mesma largura do prefixo `lg:` e do `@media` de `tokens.css`.
const CONSULTA_TELA_LARGA = '(min-width: 64rem)'

function inscreverTelaLarga(aoMudar: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {}
  const consulta = window.matchMedia(CONSULTA_TELA_LARGA)
  consulta.addEventListener('change', aoMudar)
  return () => consulta.removeEventListener('change', aoMudar)
}

function lerTelaLarga() {
  return typeof window.matchMedia === 'function' && window.matchMedia(CONSULTA_TELA_LARGA).matches
}

function useTelaLarga() {
  return useSyncExternalStore(inscreverTelaLarga, lerTelaLarga, () => false)
}

function Conteudo() {
  const larga = useTelaLarga()
  return (
    <div className="flex h-dvh">
      {larga && <BarraLateral />}
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto pb-[calc(var(--altura-barra)+env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-160 md:max-w-180 lg:max-w-280">
          <Outlet />
        </div>
      </main>
      {!larga && <BarraInferior />}
      <FormularioAberto />
    </div>
  )
}

function FormularioAberto() {
  const { estado, fechar } = useFormularios()
  const { tipo, valoresIniciais, aoSalvar, alcance, preenchimento } = estado
  if (tipo === null) return null
  if (tipo === 'cartao') {
    return (
      <FormCompraCartao
        valoresIniciais={valoresIniciais as ComponentProps<typeof FormCompraCartao>['valoresIniciais']}
        alcance={alcance}
        aoFechar={fechar}
        aoSalvar={aoSalvar}
      />
    )
  }
  // `abrir` guarda valores genéricos; o formulário espera um lançamento completo (vem de `Controle`).
  const iniciais = valoresIniciais as LancamentoSaida | undefined
  if (tipo === 'transferencia') {
    return (
      <FormTransferencia
        valoresIniciais={iniciais}
        alcance={alcance}
        preenchimento={preenchimento}
        aoFechar={fechar}
        aoSalvar={aoSalvar}
      />
    )
  }
  return (
    <FormDespesaReceita
      tipo={tipo}
      valoresIniciais={iniciais}
      alcance={alcance}
      aoFechar={fechar}
      aoSalvar={aoSalvar}
    />
  )
}
