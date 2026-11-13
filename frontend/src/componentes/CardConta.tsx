import styles from './cardConta.module.css'
import { Dinheiro } from './Dinheiro'

type CardContaProps = {
  nome: string
  instituicao: string | null
  saldoAtual: string
  saldoPrevisto: string
  onVerLancamentos(): void
  // Ações de edição ficam ligadas pela tela de contas (fatia-2.md §5.3, 2.F4); sem callback, o botão não aparece.
  onEditar?(): void
  onReajustar?(): void
  onArquivar?(): void
}

export function CardConta({
  nome,
  instituicao,
  saldoAtual,
  saldoPrevisto,
  onVerLancamentos,
  onEditar,
  onReajustar,
  onArquivar,
}: CardContaProps) {
  return (
    <article className={styles.card}>
      <header>
        <h2 className={styles.nomeConta}>{nome}</h2>
        {instituicao && <p className={styles.instituicao}>{instituicao}</p>}
      </header>
      <dl className={styles.saldos}>
        <div>
          <dt className={styles.rotulo}>Saldo atual</dt>
          <dd className={styles.valor}>
            <Dinheiro valor={saldoAtual} />
          </dd>
        </div>
        <div>
          <dt className={styles.rotulo}>Saldo previsto</dt>
          <dd className={styles.valor}>
            <Dinheiro valor={saldoPrevisto} />
          </dd>
        </div>
      </dl>
      <div className={styles.acoes}>
        <button type="button" className={styles.acao} onClick={onVerLancamentos}>
          Ver lançamentos
        </button>
        {onEditar && (
          <button type="button" className={styles.acao} onClick={onEditar}>
            Editar
          </button>
        )}
        {onReajustar && (
          <button type="button" className={styles.acao} onClick={onReajustar}>
            Reajustar
          </button>
        )}
        {onArquivar && (
          <button type="button" className={styles.acao} onClick={onArquivar}>
            Arquivar
          </button>
        )}
      </div>
    </article>
  )
}
