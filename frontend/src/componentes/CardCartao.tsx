import { Link } from 'react-router'
import { CircleCheck, CircleDashed, CircleMinus, Lock, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { CartaoSaida, FaturaStatus } from '../api/cartoes'
import { formatarData } from '../formatacao/data'
import { eZero } from '../formatacao/dinheiro'
import { formatarPercentual } from '../formatacao/percentual'
import { Dinheiro } from './Dinheiro'
import styles from './cardCartao.module.css'

type CardCartaoProps = { cartao: CartaoSaida }

// Status da fatura: ícone e texto, além da cor (RNF-08).
const STATUS: Record<FaturaStatus, { rotulo: string; Icone: LucideIcon }> = {
  aberta: { rotulo: 'Aberta', Icone: CircleDashed },
  fechada: { rotulo: 'Fechada', Icone: Lock },
  vencida: { rotulo: 'Vencida', Icone: TriangleAlert },
  zerada: { rotulo: 'Zerada', Icone: CircleMinus },
  paga: { rotulo: 'Paga', Icone: CircleCheck },
}

// Fatura do mês corrente ainda por pagar, com valor e conta ativa.
function podePagar(cartao: CartaoSaida): boolean {
  const fatura = cartao.fatura_corrente
  return (
    fatura.pagamento === null &&
    fatura.status !== 'paga' &&
    fatura.status !== 'zerada' &&
    !eZero(fatura.valor) &&
    !cartao.conta_arquivada
  )
}

export function CardCartao({ cartao }: CardCartaoProps) {
  const fatura = cartao.fatura_corrente
  const { rotulo, Icone } = STATUS[fatura.status]
  const uso = cartao.uso_porcentagem

  return (
    <article className={styles.card}>
      <header className={styles.cabecalho}>
        <h2 className={styles.nome}>
          <Link to={`/cartoes/${cartao.id}/faturas/${fatura.mes}`} className={styles.linkNome}>
            {cartao.nome}
          </Link>
        </h2>
        <span className={`${styles.status} ${styles[fatura.status]}`}>
          <Icone aria-hidden="true" size={16} />
          {rotulo}
        </span>
      </header>
      <dl className={styles.dados}>
        <div>
          <dt className={styles.rotulo}>Valor da fatura</dt>
          <dd className={styles.valor}>
            <Dinheiro valor={fatura.valor} />
          </dd>
        </div>
        <div>
          <dt className={styles.rotulo}>Vencimento</dt>
          <dd className={styles.valor}>
            <time dateTime={fatura.vencimento}>{formatarData(fatura.vencimento)}</time>
          </dd>
        </div>
        <div>
          <dt className={styles.rotulo}>Disponível</dt>
          <dd className={styles.valor}>
            <Dinheiro valor={cartao.limite_disponivel} />
          </dd>
        </div>
      </dl>
      <div className={styles.uso}>
        <div className={styles.barra} aria-hidden="true">
          <div className={styles.preenchimento} style={{ width: `${uso ?? '0'}%` }} />
        </div>
        <p className={styles.usoTexto}>
          <Dinheiro valor={cartao.limite_usado} /> usado de <Dinheiro valor={cartao.limite} />
          {uso !== null && <span>{` · ${formatarPercentual(uso)}`}</span>}
        </p>
      </div>
      <div className={styles.acoes}>
        {podePagar(cartao) && (
          <Link to={`/cartoes/${cartao.id}/faturas/${fatura.mes}?pagar=1`} className={styles.pagar}>
            Pagar fatura
          </Link>
        )}
        <Link to={`/cartoes/${cartao.id}`} className={styles.editar}>
          Editar cartão
        </Link>
      </div>
    </article>
  )
}
