import type { ComponentProps } from 'react'
import { Outlet } from 'react-router'
import type { LancamentoSaida } from '../api/lancamentos'
import { FormCompraCartao } from '../formularios/FormCompraCartao'
import { FormDespesaReceita } from '../formularios/FormDespesaReceita'
import { FormTransferencia } from '../formularios/FormTransferencia'
import { FormulariosProvider, useFormularios } from '../formularios/FormulariosProvider'
import { BarraInferior } from './BarraInferior'

export function Shell() {
  return (
    <FormulariosProvider>
      <Conteudo />
    </FormulariosProvider>
  )
}

function Conteudo() {
  return (
    <div className="flex h-dvh flex-col">
      <main className="mx-auto min-h-0 w-full max-w-160 flex-1 overflow-y-auto pb-[calc(var(--altura-barra)+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      <BarraInferior />
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
