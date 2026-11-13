import { ChevronLeft, ChevronRight } from 'lucide-react'
import { mesAnterior, mesSeguinte, rotuloMes } from '../formatacao/data'
import estilos from './seletorMes.module.css'

type Props = { mes: string; onMudar(m: string): void }

export function SeletorMes({ mes, onMudar }: Props) {
  // Com a sessão ainda não carregada, useMes devolve "" (ver useMes.ts).
  if (mes === '') return null

  return (
    <div className={estilos.seletor}>
      <button
        type="button"
        className={estilos.botao}
        aria-label="mês anterior"
        onClick={() => onMudar(mesAnterior(mes))}
      >
        <ChevronLeft aria-hidden="true" />
      </button>
      <span className={estilos.rotulo}>{rotuloMes(mes)}</span>
      <button
        type="button"
        className={estilos.botao}
        aria-label="mês seguinte"
        onClick={() => onMudar(mesSeguinte(mes))}
      >
        <ChevronRight aria-hidden="true" />
      </button>
    </div>
  )
}
