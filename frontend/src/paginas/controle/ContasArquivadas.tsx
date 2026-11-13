import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { ApiError } from '../../api/cliente'
import { desarquivarConta, listarContas } from '../../api/contas'
import { CardConta } from '../../componentes/CardConta'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import cardConta from '../../componentes/cardConta.module.css'
import styles from './contas.module.css'

export function ContasArquivadas() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const consulta = useQuery({
    queryKey: ['contas', 'arquivadas'],
    queryFn: () => listarContas({ arquivadas: true }),
  })
  const dados = consulta.data

  const desarquivar = useMutation({
    mutationFn: desarquivarConta,
    onSuccess: () => queryClient.invalidateQueries(),
  })

  return (
    <div className={styles.pagina}>
      <h1 className={styles.titulo}>Contas arquivadas</h1>

      {consulta.isError && (
        <p role="alert" className={styles.erro}>
          {consulta.error instanceof ApiError
            ? consulta.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {desarquivar.isError && (
        <p role="alert" className={styles.erro}>
          {desarquivar.error instanceof ApiError
            ? desarquivar.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {!dados && !consulta.isError && <p className={styles.aviso}>Carregando…</p>}

      {dados &&
        (dados.contas.length === 0 ? (
          <EstadoVazio
            frase="Nenhuma conta arquivada."
            acaoRotulo="Ver contas"
            onAcao={() => navigate('/controle/contas')}
          />
        ) : (
          <ul className={cardConta.lista}>
            {dados.contas.map((conta) => (
              <li key={conta.id}>
                <CardConta
                  nome={conta.nome}
                  instituicao={conta.instituicao}
                  saldoAtual={conta.saldo_atual}
                  saldoPrevisto={conta.saldo_previsto}
                  onVerLancamentos={() => navigate(`/controle/contas/${conta.id}`)}
                />
                {!conta.casal_encerrado && (
                  <div className={cardConta.acoes}>
                    <button
                      type="button"
                      className={cardConta.acao}
                      disabled={desarquivar.isPending}
                      onClick={() => desarquivar.mutate(conta.id)}
                    >
                      Desarquivar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}
