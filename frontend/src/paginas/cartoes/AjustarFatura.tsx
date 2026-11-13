import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { FaturaSaida } from '../../api/cartoes'
import { ApiError } from '../../api/cliente'
import { ajustarFatura } from '../../api/itensFatura'
import { BottomSheet } from '../../componentes/BottomSheet'
import { Campo } from '../../componentes/Campo'
import { Dinheiro } from '../../componentes/Dinheiro'
import { mascararEntrada, paraApi } from '../../formatacao/dinheiro'
import css from '../../formularios/formularios.module.css'
import estado from '../../componentes/estado.module.css'
import styles from './fatura.module.css'

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
          <button type="button" className={estado.acao} onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className={estado.acao}
            disabled={ajustar.isPending}
            onClick={() => ajustar.mutate()}
          >
            Salvar
          </button>
        </>
      }
    >
      <div className={css.campos}>
        <dl className={styles.dados}>
          <div className={styles.campo}>
            <dt className={styles.rotulo}>Valor atual</dt>
            <dd className={styles.valor}>
              <Dinheiro valor={fatura.valor} />
            </dd>
          </div>
        </dl>

        <Campo rotulo="Valor conforme o banco" erro={erroValor}>
          <input
            className={css.controle}
            type="text"
            inputMode="numeric"
            placeholder="0,00"
            value={valor}
            onChange={(e) => setValor(mascararEntrada(e.target.value))}
          />
        </Campo>

        {ajustar.isError && (
          <p role="alert" className={css.erro}>
            {erroAjustar}
          </p>
        )}
      </div>
    </BottomSheet>
  )
}
