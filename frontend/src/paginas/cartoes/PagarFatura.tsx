import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FaturaSaida } from '../../api/cartoes'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { listarContas } from '../../api/contas'
import { pagarFatura } from '../../api/itensFatura'
import { BottomSheet } from '../../componentes/BottomSheet'
import { Campo } from '../../componentes/Campo'
import { Dinheiro } from '../../componentes/Dinheiro'
import { diaAnterior } from '../../formularios/CamposLancamento'
import css from '../../formularios/formularios.module.css'
import { useSessao } from '../../hooks/useSessao'
import estado from '../../componentes/estado.module.css'
import styles from './fatura.module.css'

type Props = {
  fatura: FaturaSaida
  aoFechar: () => void
}

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
          <button type="button" className={estado.acao} onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className={estado.acao}
            disabled={!data || pagar.isPending}
            onClick={() => pagar.mutate()}
          >
            Pagar
          </button>
        </>
      }
    >
      <div className={css.campos}>
        <dl className={styles.dados}>
          <div className={styles.campo}>
            <dt className={styles.rotulo}>Valor da fatura</dt>
            <dd className={styles.valor}>
              <Dinheiro valor={fatura.valor} />
            </dd>
          </div>
          <div className={styles.campo}>
            <dt className={styles.rotulo}>Conta</dt>
            <dd className={styles.valor}>
              {conta?.nome ?? (contas.isError ? 'Não carregada' : 'Carregando conta…')}
            </dd>
          </div>
        </dl>

        <div className={css.atalhos} role="group" aria-label="Atalhos de data">
          <button
            type="button"
            className={css.atalho}
            disabled={!hoje}
            aria-pressed={hoje !== undefined && data === hoje}
            onClick={() => setDataEscolhida(hoje ?? null)}
          >
            Hoje
          </button>
          <button
            type="button"
            className={css.atalho}
            disabled={!hoje}
            aria-pressed={hoje !== undefined && data === diaAnterior(hoje)}
            onClick={() => setDataEscolhida(hoje ? diaAnterior(hoje) : null)}
          >
            Ontem
          </button>
          <button
            type="button"
            className={css.atalho}
            onClick={() => inputData.current?.focus()}
          >
            Outra data
          </button>
        </div>
        <Campo rotulo="Data" erro={erroData}>
          <input
            ref={inputData}
            className={css.controle}
            type="date"
            value={data}
            onChange={(e) => setDataEscolhida(e.target.value)}
          />
        </Campo>

        {contas.isError && (
          <p role="alert" className={css.erro}>
            Não foi possível carregar a conta.
          </p>
        )}

        {pagar.isError && (
          <p role="alert" className={css.erro}>
            {erroPagar}
          </p>
        )}
      </div>
    </BottomSheet>
  )
}
