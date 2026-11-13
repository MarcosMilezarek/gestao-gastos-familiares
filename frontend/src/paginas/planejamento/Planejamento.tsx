import { Link } from 'react-router'
import styles from './planejamento.module.css'

// Exatamente 3 entradas (fatia-7.md §5.1, CA-7.02).
const ENTRADAS = [
  { rotulo: 'Orçamento do mês', caminho: '/planejamento/orcamento' },
  { rotulo: 'Cenários', caminho: '/planejamento/cenarios' },
  { rotulo: 'Plano de metas', caminho: '/planejamento/plano-de-metas' },
]

// Menu da aba Planejamento (RF-7.02): só links para as telas da fatia.
export function Planejamento() {
  return (
    <div className={styles.pagina}>
      <header className={styles.topo}>
        <h1 className={styles.titulo}>Planejamento</h1>
      </header>

      <nav aria-label="Planejamento">
        <ul className={styles.menu}>
          {ENTRADAS.map((entrada) => (
            <li key={entrada.caminho}>
              <Link to={entrada.caminho} className={styles.item}>
                {entrada.rotulo}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
