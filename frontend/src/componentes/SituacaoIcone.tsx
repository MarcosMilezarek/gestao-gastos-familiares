import { CircleCheck, Clock, TriangleAlert, type LucideIcon } from 'lucide-react'
import styles from './estado.module.css'

type Situacao = 'confirmada' | 'prevista' | 'atrasada'

const SITUACOES: Record<Situacao, { rotulo: string; Icone: LucideIcon }> = {
  confirmada: { rotulo: 'Confirmada', Icone: CircleCheck },
  prevista: { rotulo: 'Prevista', Icone: Clock },
  atrasada: { rotulo: 'Atrasada', Icone: TriangleAlert },
}

export function SituacaoIcone({ situacao }: { situacao: Situacao }) {
  const { rotulo, Icone } = SITUACOES[situacao]
  return (
    <span className={`${styles.situacao} ${styles[situacao]}`}>
      <Icone aria-hidden="true" size={16} />
      {rotulo}
    </span>
  )
}
