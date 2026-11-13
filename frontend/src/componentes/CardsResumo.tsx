import type { ReactNode } from 'react'
import styles from './cardsResumo.module.css'

export function CardsResumo({ children }: { children: ReactNode }) {
  return <div className={styles.cards}>{children}</div>
}
