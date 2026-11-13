import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { ApiError } from '../../api/cliente'
import { obterConta } from '../../api/contas'
import estado from '../../componentes/estado.module.css'
import { SeletorMes } from '../../componentes/SeletorMes'
import { useMes } from '../../hooks/useMes'
import { ListaDoMes } from './Controle'
import styles from './controle.module.css'

export function ControleConta() {
  const { contaId } = useParams()
  const id = Number(contaId)
  const { mes, setMes } = useMes()

  const consulta = useQuery({
    queryKey: ['contas', id, mes],
    queryFn: () => obterConta(id, mes),
    enabled: mes !== '' && Number.isInteger(id),
  })
  const conta = consulta.data

  if (!Number.isInteger(id)) {
    return (
      <div className={styles.pagina}>
        <p role="alert" className={styles.erro}>
          Conta não encontrada.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.pagina}>
      <SeletorMes mes={mes} onMudar={setMes} />
      <Link to="/controle/contas" className={estado.voltar}>
        Contas
      </Link>

      {consulta.isError && (
        <p role="alert" className={styles.erro}>
          {consulta.error instanceof ApiError
            ? consulta.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {!conta && !consulta.isError && <p className={styles.aviso}>Carregando…</p>}

      {conta && (
        <>
          <h1 className={styles.titulo}>{conta.nome}</h1>
          <ListaDoMes mes={mes} contaId={id} podeEscrever={!conta.arquivado} />
        </>
      )}
    </div>
  )
}
