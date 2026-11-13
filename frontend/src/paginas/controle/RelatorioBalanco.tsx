import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { obterRelatorioBalancoMensal } from '../../api/relatorios'
import type { MesBalancoRelatorio } from '../../api/relatorios'
import { Dinheiro } from '../../componentes/Dinheiro'
import { GraficoBarras } from '../../componentes/GraficoBarras'
import estado from '../../componentes/estado.module.css'
import { SeletorMes } from '../../componentes/SeletorMes'
import { rotuloMes } from '../../formatacao/data'
import { useMes } from '../../hooks/useMes'
import styles from './balanco.module.css'

type TipoDinheiro = 'entrada' | 'saida' | 'neutro'
type Par = MesBalancoRelatorio['entradas']

function BlocoPar({ rotulo, par, tipo = 'neutro' }: { rotulo: string; par: Par; tipo?: TipoDinheiro }) {
  return (
    <div className={styles.bloco}>
      <p className={styles.rotulo}>{rotulo}</p>
      <dl className={styles.par}>
        <div>
          <dt>Previsto</dt>
          <dd>
            <Dinheiro valor={par.previsto} tipo={tipo} />
          </dd>
        </div>
        <div>
          <dt>Realizado</dt>
          <dd>
            <Dinheiro valor={par.realizado} tipo={tipo} />
          </dd>
        </div>
      </dl>
    </div>
  )
}

// "AAAA-MM" -> "MM/AA": o eixo do gráfico é estreito no celular.
function rotuloCurto(mes: string): string {
  return `${mes.slice(5)}/${mes.slice(2, 4)}`
}

export function RelatorioBalanco() {
  const { mes, setMes } = useMes()

  const consulta = useQuery({
    queryKey: ['relatorio-balanco', mes],
    queryFn: () => obterRelatorioBalancoMensal(mes),
    enabled: mes !== '',
    // Erro 4xx é determinístico: não repete.
    retry: repetirSem4xx,
  })
  const dados = consulta.data

  return (
    <div className={styles.pagina}>
      <SeletorMes mes={mes} onMudar={setMes} />
      <Link to={`/controle/relatorios?mes=${mes}`} className={estado.voltar}>
        Relatórios
      </Link>
      <h1 className={styles.titulo}>Balanço mensal</h1>

      {consulta.isError && (
        <p role="alert" className={styles.erro}>
          {consulta.error instanceof ApiError
            ? consulta.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {!dados && !consulta.isError && <p className={styles.aviso}>Carregando…</p>}

      {dados && (
        <>
          <section className={styles.card}>
            <h2 className={styles.nome}>Entradas × saídas (previsto)</h2>
            <GraficoBarras
              meses={dados.meses.map((item) => ({
                rotulo: rotuloCurto(item.mes),
                entradas: item.entradas.previsto,
                saidas: item.saidas.previsto,
              }))}
            />
          </section>

          {dados.meses.map((item) => (
            <section key={item.mes} className={styles.card}>
              <h2 className={styles.nome}>{rotuloMes(item.mes)}</h2>
              <BlocoPar rotulo="Entradas" par={item.entradas} tipo="entrada" />
              <BlocoPar rotulo="Saídas" par={item.saidas} tipo="saida" />
              <BlocoPar rotulo="Saldo do mês" par={item.saldo} />
            </section>
          ))}
        </>
      )}
    </div>
  )
}
