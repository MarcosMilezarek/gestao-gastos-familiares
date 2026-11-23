import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { FaturaSaida } from '../../api/cartoes'
import { ApiError } from '../../api/cliente'
import { confirmarPagamento, desfazerPagamento } from '../../api/itensFatura'
import { Button } from '@/components/ui/button'
import { DialogoConfirmacao } from '../../componentes/DialogoConfirmacao'

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
    return <p className="text-14 text-muted-foreground">Conta arquivada: a fatura é só para consulta</p>
  }

  const falha = confirmar.error ?? desfazer.error
  const erroAcao =
    falha instanceof ApiError ? falha.mensagem : falha ? 'Erro inesperado. Tente novamente.' : null

  return (
    <>
      {!pagamento && fatura.pode_pagar && (
        <Button type="button" size="lg" className="w-full" onClick={aoPagar}>
          Pagar fatura
        </Button>
      )}

      {pagamento?.situacao === 'prevista' && (
        <>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={confirmar.isPending || desfazer.isPending}
            onClick={() => confirmar.mutate()}
          >
            Confirmar pagamento
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={confirmar.isPending || desfazer.isPending}
            onClick={() => desfazer.mutate()}
          >
            Cancelar pagamento previsto
          </Button>
        </>
      )}

      {pagamento?.situacao === 'confirmada' && (
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="w-full"
          onClick={() => setDesfazendo(true)}
        >
          Desfazer pagamento
        </Button>
      )}

      {erroAcao && (
        <p role="alert" className="text-14 text-saida-texto">
          {erroAcao}
        </p>
      )}

      {desfazendo && (
        <DialogoConfirmacao
          titulo="Desfazer pagamento"
          texto="Desfazer o pagamento desta fatura?"
          rotuloAcao="Desfazer"
          destrutivo
          onConfirmar={() => desfazer.mutate()}
          onCancelar={() => setDesfazendo(false)}
        />
      )}
    </>
  )
}
