import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { MetaSaida } from '../api/metas'
import { formatarData } from '../formatacao/data'
import { formatarPercentual } from '../formatacao/percentual'
import { Dinheiro } from './Dinheiro'
import { iconeDe } from './icones'
import styles from '../paginas/metas/metas.module.css'

type CardMetaProps = { meta: MetaSaida }

// Ícone da meta na cor dela (nome desconhecido cai no padrão de icones.ts).
function iconeColorido(meta: MetaSaida): ReactNode {
  const Icone = iconeDe(meta.icone)
  return <Icone aria-hidden="true" size={20} color={meta.cor} />
}

// Porcentagem em texto ao lado da barra: a informação não depende só da cor (RNF-08).
// A largura da barra usa a string da API; nunca passa por number.
export function CardMeta({ meta }: CardMetaProps) {
  return (
    <Link to={`/metas/${meta.id}`} className={styles.card}>
      <span className={styles.nome}>
        {iconeColorido(meta)}
        {meta.nome}
      </span>
      <dl className={styles.dados}>
        <div>
          <dt className={styles.rotulo}>Valor atual</dt>
          <dd className={styles.valor}>
            <Dinheiro valor={meta.valor_atual} />
          </dd>
        </div>
        <div>
          <dt className={styles.rotulo}>Alvo</dt>
          <dd className={styles.valor}>
            <Dinheiro valor={meta.valor_alvo} />
          </dd>
        </div>
        <div>
          <dt className={styles.rotulo}>Falta</dt>
          <dd className={styles.valor}>
            <Dinheiro valor={meta.falta} />
          </dd>
        </div>
      </dl>
      <div className={styles.progresso}>
        <div className={styles.barra} aria-hidden="true">
          <div
            className={styles.preenchimento}
            style={{ width: `min(${meta.porcentagem}%, 100%)`, background: meta.cor }}
          />
        </div>
        <p className={styles.porcentagem}>{formatarPercentual(meta.porcentagem)}</p>
      </div>
      {meta.data_alvo !== null && (
        <p className={styles.dataAlvo}>
          Data-alvo: <time dateTime={meta.data_alvo}>{formatarData(meta.data_alvo)}</time>
        </p>
      )}
    </Link>
  )
}
