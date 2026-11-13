import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { obterProporcao } from '../../api/proporcao'
import { CardsProporcao } from '../../componentes/CardsProporcao'
import { CardsResumo } from '../../componentes/CardsResumo'
import { Dinheiro } from '../../componentes/Dinheiro'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import estado from '../../componentes/estado.module.css'
import { SeletorMes } from '../../componentes/SeletorMes'
import { eZero } from '../../formatacao/dinheiro'
import { useMes } from '../../hooks/useMes'
import styles from './proporcao.module.css'

export function Proporcao() {
  const navigate = useNavigate()
  const { mes, setMes } = useMes()

  const consulta = useQuery({
    queryKey: ['proporcao', mes],
    queryFn: () => obterProporcao(mes),
    enabled: mes !== '',
    // Erro 4xx (ex.: SEM_VINCULO, 409) é determinístico: não repete.
    retry: repetirSem4xx,
  })
  const dados = consulta.data

  const semVinculo = consulta.error instanceof ApiError && consulta.error.codigo === 'SEM_VINCULO'

  return (
    <div className={styles.pagina}>
      <SeletorMes mes={mes} onMudar={setMes} />
      <Link to={`/controle?mes=${mes}`} className={estado.voltar}>
        Controle
      </Link>
      <h1 className={styles.titulo}>Proporção e aporte do mês</h1>

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

      {dados && (
        <>
          <CardsResumo>
            <section className={styles.card}>
              <h2 className={styles.nome}>Base de despesas do casal</h2>
              <Dinheiro valor={dados.base_despesas_casal} />
              {eZero(dados.base_despesas_casal) && (
                <p className={styles.aviso}>Sem despesas do casal neste mês</p>
              )}
            </section>
          </CardsResumo>
          <CardsProporcao proporcao={dados} />
        </>
      )}
    </div>
  )
}
