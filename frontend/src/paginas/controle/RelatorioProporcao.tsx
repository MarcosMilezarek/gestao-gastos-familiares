import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { obterRelatorioProporcao } from '../../api/relatorios'
import { CardsProporcao } from '../../componentes/CardsProporcao'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import estado from '../../componentes/estado.module.css'
import { SeletorMes } from '../../componentes/SeletorMes'
import { rotuloMes } from '../../formatacao/data'
import { useMes } from '../../hooks/useMes'
import styles from './relatorios.module.css'

export function RelatorioProporcao() {
  const navigate = useNavigate()
  const { mes, setMes } = useMes()

  const consulta = useQuery({
    queryKey: ['relatorio-proporcao', mes],
    queryFn: () => obterRelatorioProporcao(mes),
    enabled: mes !== '',
    // Erro 4xx (ex.: SEM_VINCULO) é determinístico: não repete.
    retry: repetirSem4xx,
  })
  const dados = consulta.data

  const semVinculo = consulta.error instanceof ApiError && consulta.error.codigo === 'SEM_VINCULO'

  return (
    <div className={styles.pagina}>
      <SeletorMes mes={mes} onMudar={setMes} />
      <Link to={`/controle/relatorios?mes=${mes}`} className={estado.voltar}>
        Relatórios
      </Link>
      <h1 className={styles.titulo}>Proporção e aporte</h1>

      {semVinculo && (
        <EstadoVazio
          frase="Você ainda não está vinculado a um casal."
          acaoRotulo="Ir para o vínculo"
          onAcao={() => navigate('/configuracoes/vinculo')}
        />
      )}
      {consulta.isError && !semVinculo && (
        <p role="alert" className={styles.erro}>
          {consulta.error instanceof ApiError
            ? consulta.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {!dados && !consulta.isError && <p className={styles.aviso}>Carregando…</p>}

      {dados?.meses.map((item) => (
        <section key={item.mes} className={styles.grupo}>
          <h2 className={styles.nome}>{rotuloMes(item.mes)}</h2>
          <CardsProporcao proporcao={item} />
        </section>
      ))}
    </div>
  )
}
