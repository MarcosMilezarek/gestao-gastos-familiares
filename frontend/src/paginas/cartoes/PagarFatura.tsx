import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FaturaSaida } from '../../api/cartoes'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { listarContas } from '../../api/contas'
import { pagarFatura } from '../../api/itensFatura'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BottomSheet } from '../../componentes/BottomSheet'
import { Campo } from '../../componentes/Campo'
import { Dinheiro } from '../../componentes/Dinheiro'
import { diaAnterior } from '../../formularios/CamposLancamento'
import { useSessao } from '../../hooks/useSessao'

type Props = {
  fatura: FaturaSaida
  aoFechar: () => void
}

const CLASSE_ATALHO = 'aria-pressed:border-primary aria-pressed:bg-primary-suave'

// Pagamento sempre pelo total da fatura, na conta dona do cartão: sem campo de valor nem de conta (CA-4.14).
export function PagarFatura({ fatura, aoFechar }: Props) {
  const queryClient = useQueryClient()
  const hoje = useSessao().data?.hoje
  const inputData = useRef<HTMLInputElement>(null)
  // `null` = ainda não escolhida: usa hoje, vindo do servidor. String vazia = campo limpo.
  const [dataEscolhida, setDataEscolhida] = useState<string | null>(null)
  const data = dataEscolhida ?? hoje ?? ''

  const contas = useQuery({
    queryKey: ['contas'],
    queryFn: async () => (await listarContas()).contas,
    retry: repetirSem4xx,
  })
  const conta = contas.data?.find((c) => c.id === fatura.conta_id)

  const pagar = useMutation({
    mutationFn: () => pagarFatura(fatura.cartao_id, fatura.mes, data),
    onSuccess: () => {
      queryClient.invalidateQueries()
      aoFechar()
    },
  })

  const erroData = pagar.error instanceof ApiError ? pagar.error.campos?.data : undefined
  const erroPagar =
    pagar.error instanceof ApiError ? pagar.error.mensagem : 'Erro inesperado. Tente novamente.'

  return (
    <BottomSheet
      titulo="Pagar fatura"
      aoFechar={aoFechar}
      rodape={
        <>
          <Button type="button" variant="outline" size="lg" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="button" size="lg" disabled={!data || pagar.isPending} onClick={() => pagar.mutate()}>
            Pagar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <dl className="flex flex-col gap-2 text-16">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Valor da fatura</dt>
            <dd className="tabular-nums">
              <Dinheiro valor={fatura.valor} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Conta</dt>
            <dd className="min-w-0 truncate text-right font-semibold">
              {conta?.nome ?? (contas.isError ? 'Não carregada' : 'Carregando conta…')}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Atalhos de data">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className={CLASSE_ATALHO}
            disabled={!hoje}
            aria-pressed={hoje !== undefined && data === hoje}
            onClick={() => setDataEscolhida(hoje ?? null)}
          >
            Hoje
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className={CLASSE_ATALHO}
            disabled={!hoje}
            aria-pressed={hoje !== undefined && data === diaAnterior(hoje)}
            onClick={() => setDataEscolhida(hoje ? diaAnterior(hoje) : null)}
          >
            Ontem
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => inputData.current?.focus()}
          >
            Outra data
          </Button>
        </div>
        <Campo rotulo="Data" erro={erroData}>
          <Input
            ref={inputData}
            type="date"
            value={data}
            onChange={(e) => setDataEscolhida(e.target.value)}
          />
        </Campo>

        {contas.isError && (
          <p role="alert" className="text-14 text-saida-texto">
            Não foi possível carregar a conta.
          </p>
        )}

        {pagar.isError && (
          <p role="alert" className="text-14 text-saida-texto">
            {erroPagar}
          </p>
        )}
      </div>
    </BottomSheet>
  )
}
