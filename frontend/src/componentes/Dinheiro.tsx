import { eNegativo, eZero, formatarBRL } from '../formatacao/dinheiro'
import { cn } from '@/lib/utils'

type TipoDinheiro = 'entrada' | 'saida' | 'neutro'

type DinheiroProps = { valor: string; tipo?: TipoDinheiro }

const CORES: Record<TipoDinheiro, string> = {
  entrada: 'text-entrada-texto',
  saida: 'text-saida-texto',
  neutro: 'text-foreground',
}

// Sinal além da cor, para o valor não depender só de cor (RNF-08).
// Valor já negativo leva o próprio "-" de formatarBRL.
function sinalDoTipo(valor: string, tipo: TipoDinheiro): string {
  if (tipo === 'neutro' || eZero(valor) || eNegativo(valor)) return ''
  return tipo === 'entrada' ? '+' : '-'
}

export function Dinheiro({ valor, tipo = 'neutro' }: DinheiroProps) {
  return (
    <span className={cn('font-semibold tabular-nums', CORES[tipo])}>
      {sinalDoTipo(valor, tipo)}
      {formatarBRL(valor)}
    </span>
  )
}
