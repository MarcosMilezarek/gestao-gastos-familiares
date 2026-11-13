import { useState } from 'react'
import { NavLink } from 'react-router'
import { CalendarDays, ChartColumn, CreditCard, House, Plus, Target } from 'lucide-react'
import { MenuMais } from './MenuMais'
import styles from './navegacao.module.css'

export function BarraInferior() {
  const [menuAberto, setMenuAberto] = useState(false)

  return (
    <>
      <nav className={styles.barra} aria-label="Principal">
        <NavLink to="/" end className={styles.item}>
          <House aria-hidden="true" />
          <span className={styles.rotulo}>Início</span>
        </NavLink>
        <NavLink to="/controle" className={styles.item}>
          <ChartColumn aria-hidden="true" />
          <span className={styles.rotulo}>Controle</span>
        </NavLink>
        <button
          type="button"
          aria-label="Novo lançamento"
          aria-haspopup="dialog"
          className={styles.mais}
          onClick={() => setMenuAberto(true)}
        >
          <Plus aria-hidden="true" />
        </button>
        <NavLink to="/cartoes" className={styles.item}>
          <CreditCard aria-hidden="true" />
          <span className={styles.rotulo}>Cartões</span>
        </NavLink>
        <NavLink to="/metas" className={styles.item}>
          <Target aria-hidden="true" />
          <span className={styles.rotulo}>Metas</span>
        </NavLink>
        <NavLink to="/planejamento" className={styles.item}>
          <CalendarDays aria-hidden="true" />
          <span className={styles.rotulo}>Planejamento</span>
        </NavLink>
      </nav>
      {menuAberto && <MenuMais aoFechar={() => setMenuAberto(false)} />}
    </>
  )
}
