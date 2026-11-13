import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { obterBalanco } from '../../api/controle'
import type { BalancoConta, DonoBalanco, Par } from '../../api/controle'
import { CardsResumo } from '../../componentes/CardsResumo'
import { Dinheiro } from '../../componentes/Dinheiro'
import estado from '../../componentes/estado.module.css'
import { SeletorMes } from '../../componentes/SeletorMes'
import { useMes } from '../../hooks/useMes'
import styles from './balanco.module.css'

type TipoDinheiro = 'entrada' | 'saida' | 'neutro'

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

function CartaoConta({ conta }: { conta: BalancoConta }) {
  return (
    <section className={styles.card}>
      <h2 className={styles.nome}>{conta.nome}</h2>
      <BlocoPar rotulo="Entradas" par={conta.entradas} tipo="entrada" />
      <BlocoPar rotulo="Saídas" par={conta.saidas} tipo="saida" />
      <BlocoPar rotulo="Saldo do mês" par={conta.saldo} />
      <div className={styles.bloco}>
        <p className={styles.rotulo}>Saldo atual</p>
        <Dinheiro valor={conta.saldo_atual} />
      </div>
      <div className={styles.bloco}>
        <p className={styles.rotulo}>Saldo previsto</p>
        <Dinheiro valor={conta.saldo_previsto} />
      </div>
      <div className={styles.transferencias}>
        <h3 className={styles.subtitulo}>Transferências (informativo, não entram no saldo do mês)</h3>
        <BlocoPar rotulo="Entrada" par={conta.transferencias_entrada} />
        <BlocoPar rotulo="Saída" par={conta.transferencias_saida} />
      </div>
    </section>
  )
}

function CartaoDono({ dono }: { dono: DonoBalanco }) {
  return (
    <section className={styles.card}>
      <h2 className={styles.nome}>{dono.nome}</h2>
      <BlocoPar rotulo="Entradas" par={dono.entradas} tipo="entrada" />
      <BlocoPar rotulo="Saídas" par={dono.saidas} tipo="saida" />
      <BlocoPar rotulo="Saldo do mês" par={dono.saldo} />
    </section>
  )
}

export function Balanco() {
  const { mes, setMes } = useMes()

  const consulta = useQuery({
    queryKey: ['balanco', mes],
    queryFn: () => obterBalanco(mes),
    enabled: mes !== '',
    // Erro 4xx é determinístico: não repete.
    retry: repetirSem4xx,
  })
  const dados = consulta.data

  return (
    <div className={styles.pagina}>
      <SeletorMes mes={mes} onMudar={setMes} />
      <Link to={`/controle?mes=${mes}`} className={estado.voltar}>
        Controle
      </Link>
      <h1 className={styles.titulo}>Balanço do mês</h1>

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
            <h2 className={styles.nome}>Total do mês</h2>
            <BlocoPar rotulo="Entradas" par={dados.total.entradas} tipo="entrada" />
            <BlocoPar rotulo="Saídas" par={dados.total.saidas} tipo="saida" />
            <BlocoPar rotulo="Saldo do mês" par={dados.total.saldo} />
          </section>

          <CardsResumo>
            {dados.contas.map((conta) => (
              <CartaoConta key={conta.conta_id} conta={conta} />
            ))}
          </CardsResumo>

          <CardsResumo>
            {dados.donos.map((dono) => (
              <CartaoDono key={dono.dono_usuario_id ?? 'casal'} dono={dono} />
            ))}
          </CardsResumo>
        </>
      )}
    </div>
  )
}
