import styles from './estado.module.css'

type EstadoVazioProps = {
  frase: string
  acaoRotulo?: string
  onAcao?: () => void
}

export function EstadoVazio({ frase, acaoRotulo, onAcao }: EstadoVazioProps) {
  return (
    <div className={styles.vazio}>
      <p className={styles.frase}>{frase}</p>
      {acaoRotulo && onAcao && (
        <button type="button" className={styles.acao} onClick={onAcao}>
          {acaoRotulo}
        </button>
      )}
    </div>
  )
}
