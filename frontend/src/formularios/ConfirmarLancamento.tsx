import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/cliente'
import { confirmarLancamento, type LancamentoSaida } from '../api/lancamentos'
import { BottomSheet } from '../componentes/BottomSheet'
import { Campo } from '../componentes/Campo'
import { mascararEntrada, paraApi } from '../formatacao/dinheiro'
import css from './formularios.module.css'

type Props = { lancamento: Pick<LancamentoSaida, 'id' | 'valor'>; aoFechar(): void }

// A API devolve "1234.50"; o campo mostra o texto mascarado "1.234,50".
function valorInicial(valor: string): string {
  const [inteiro = '', centavos = ''] = valor.split('.')
  return mascararEntrada(inteiro + centavos.padEnd(2, '0'))
}

export function ConfirmarLancamento({ lancamento, aoFechar }: Props) {
  const queryClient = useQueryClient()
  const idFormulario = useId()
  const idValor = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [valor, setValor] = useState(() => valorInicial(lancamento.valor))

  const confirmar = useMutation({
    mutationFn: (texto: string) => confirmarLancamento(lancamento.id, { valor: paraApi(texto) }),
    onSuccess: () => {
      queryClient.invalidateQueries()
      aoFechar()
    },
  })

  // Foco no valor quando a API recusa o erro dele (aria-invalid vem do Campo).
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [confirmar.error])

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    confirmar.mutate(valor)
  }

  const erroCampo = confirmar.error instanceof ApiError ? confirmar.error.campos?.valor : undefined
  // Erros sem campo (ex.: LANCAMENTO_JA_CONFIRMADO, CONTA_ARQUIVADA) mostram a mensagem do servidor.
  const erroGeral = confirmar.error && !erroCampo ? confirmar.error.message : undefined

  return (
    <BottomSheet
      titulo="Confirmar lançamento"
      aoFechar={aoFechar}
      rodape={
        <>
          <button type="button" className={css.atalho} onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="submit"
            form={idFormulario}
            className={css.atalho}
            disabled={confirmar.isPending}
          >
            Confirmar
          </button>
        </>
      }
    >
      <form ref={formRef} id={idFormulario} className={css.campos} onSubmit={enviar}>
        <Campo rotulo="Valor real" erro={erroCampo}>
          <input
            id={idValor}
            className={css.controle}
            type="text"
            inputMode="numeric"
            value={valor}
            onChange={(e) => setValor(mascararEntrada(e.target.value))}
          />
        </Campo>
        {erroGeral && (
          <p role="alert" className={css.erro}>
            {erroGeral}
          </p>
        )}
      </form>
    </BottomSheet>
  )
}
