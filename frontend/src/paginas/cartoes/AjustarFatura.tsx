import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { FaturaSaida } from '../../api/cartoes'
import { ApiError } from '../../api/cliente'
import { ajustarFatura } from '../../api/itensFatura'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BottomSheet } from '../../componentes/BottomSheet'
import { Campo } from '../../componentes/Campo'
import { Dinheiro } from '../../componentes/Dinheiro'
import { mascararEntrada, paraApi } from '../../formatacao/dinheiro'

type Props = {
  fatura: FaturaSaida
  aoFechar: () => void
}

// Ajuste pelo valor que o banco mostra. Diferença zero não cria linha: o servidor responde `item: null` e o sheet só fecha (CA-4.17).
export function AjustarFatura({ fatura, aoFechar }: Props) {
  const queryClient = useQueryClient()
  // Começa com o valor atual da fatura, para a pessoa só ajustar o que diverge.
  const [valor, setValor] = useState(() => mascararEntrada(fatura.valor.replace(/\D/g, '')))

  const ajustar = useMutation({
    mutationFn: () => ajustarFatura(fatura.cartao_id, fatura.mes, paraApi(valor)),
    onSuccess: () => {
      queryClient.invalidateQueries()
      aoFechar()
    },
  })

  const erroValor = ajustar.error instanceof ApiError ? ajustar.error.campos?.valor_banco : undefined
  const erroAjustar =
    ajustar.error instanceof ApiError ? ajustar.error.mensagem : 'Erro inesperado. Tente novamente.'

  return (
    <BottomSheet
      titulo="Ajustar fatura"
      aoFechar={aoFechar}
      rodape={
        <>
          <Button type="button" variant="outline" size="lg" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="button" size="lg" disabled={ajustar.isPending} onClick={() => ajustar.mutate()}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <dl className="flex items-center justify-between gap-3 text-16">
          <dt className="text-muted-foreground">Valor atual</dt>
          <dd className="tabular-nums">
            <Dinheiro valor={fatura.valor} />
          </dd>
        </dl>

        <Campo rotulo="Valor conforme o banco" erro={erroValor}>
          <Input
            type="text"
            inputMode="numeric"
            placeholder="0,00"
            value={valor}
            onChange={(e) => setValor(mascararEntrada(e.target.value))}
          />
        </Campo>

        {ajustar.isError && (
          <p role="alert" className="text-14 text-saida-texto">
            {erroAjustar}
          </p>
        )}
      </div>
    </BottomSheet>
  )
}
