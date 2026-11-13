import { eNegativo, eZero, formatarBRL } from '../formatacao/dinheiro'
import css from './formato.module.css'

type TipoDinheiro = 'entrada' | 'saida' | 'neutro'

type DinheiroProps = { valor: string; tipo?: TipoDinheiro }

// Sinal além da cor, para o valor não depender só de cor (RNF-08).
// Valor já negativo leva o próprio "-" de formatarBRL.
function sinalDoTipo(valor: string, tipo: TipoDinheiro): string {
  if (tipo === 'neutro' || eZero(valor) || eNegativo(valor)) return ''
  return tipo === 'entrada' ? '+' : '-'
}

export function Dinheiro({ valor, tipo = 'neutro' }: DinheiroProps) {
  return (
    <span className={`${css.dinheiro} ${css[tipo]}`}>
      {sinalDoTipo(valor, tipo)}
      {formatarBRL(valor)}
    </span>
  )
}
