import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { FaturaSaida } from '../../api/cartoes'
import { ApiError } from '../../api/cliente'
import { confirmarPagamento, desfazerPagamento } from '../../api/itensFatura'
import { DialogoConfirmacao } from '../../componentes/DialogoConfirmacao'
import styles from './fatura.module.css'

type Props = {
  fatura: FaturaSaida
  aoPagar: () => void
}

// Ações do pagamento da fatura. Conta arquivada só consulta: aviso no lugar delas (CA-4.22, D-048).
export function AcoesPagamento({ fatura, aoPagar }: Props) {
  const queryClient = useQueryClient()
  const [desfazendo, setDesfazendo] = useState(false)
  const pagamento = fatura.pagamento

  const confirmar = useMutation({
    mutationFn: () => confirmarPagamento(fatura.cartao_id, fatura.mes),
    onSuccess: () => {
      queryClient.invalidateQueries()
    },
  })

  // Cancela o previsto ou desfaz o confirmado: a mesma rota DELETE.
  const desfazer = useMutation({
    mutationFn: () => desfazerPagamento(fatura.cartao_id, fatura.mes),
    onSuccess: () => {
      queryClient.invalidateQueries()
    },
    onSettled: () => setDesfazendo(false),
  })

  if (fatura.conta_arquivada) {
    return <p className={styles.aviso}>Conta arquivada: a fatura é só para consulta</p>
  }

  const falha = confirmar.error ?? desfazer.error
  const erroAcao =
    falha instanceof ApiError ? falha.mensagem : falha ? 'Erro inesperado. Tente novamente.' : null

  return (
    <>
      {!pagamento && fatura.pode_pagar && (
        <button type="button" className={styles.acao} onClick={aoPagar}>
          Pagar fatura
        </button>
      )}

      {pagamento?.situacao === 'prevista' && (
        <>
          <button
            type="button"
            className={styles.acao}
            disabled={confirmar.isPending || desfazer.isPending}
            onClick={() => confirmar.mutate()}
          >
            Confirmar pagamento
          </button>
          <button
            type="button"
            className={styles.acao}
            disabled={confirmar.isPending || desfazer.isPending}
            onClick={() => desfazer.mutate()}
          >
            Cancelar pagamento previsto
          </button>
        </>
      )}

      {pagamento?.situacao === 'confirmada' && (
        <button type="button" className={styles.acao} onClick={() => setDesfazendo(true)}>
          Desfazer pagamento
        </button>
      )}

      {erroAcao && (
        <p role="alert" className={styles.erro}>
          {erroAcao}
        </p>
      )}

      {desfazendo && (
        <DialogoConfirmacao
          titulo="Desfazer pagamento"
          texto="Desfazer o pagamento desta fatura?"
          rotuloAcao="Desfazer"
          onConfirmar={() => desfazer.mutate()}
          onCancelar={() => setDesfazendo(false)}
        />
      )}
    </>
  )
}
