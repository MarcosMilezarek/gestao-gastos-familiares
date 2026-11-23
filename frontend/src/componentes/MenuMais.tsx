import { ArrowLeftRight, ChevronRight, CreditCard, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'
import { useFormularios, type TipoFormulario } from '../formularios/FormulariosProvider'
import { BottomSheet } from './BottomSheet'
import { IconeQuadrado } from './IconeQuadrado'

const OPCOES: {
  tipo: TipoFormulario
  rotulo: string
  icone: LucideIcon
  tom: 'saida' | 'entrada' | 'alerta' | 'primaria'
}[] = [
  { tipo: 'despesa', rotulo: 'Despesa', icone: TrendingDown, tom: 'saida' },
  { tipo: 'receita', rotulo: 'Receita', icone: TrendingUp, tom: 'entrada' },
  { tipo: 'cartao', rotulo: 'Despesa no cartão', icone: CreditCard, tom: 'alerta' },
  { tipo: 'transferencia', rotulo: 'Aporte/Transferência', icone: ArrowLeftRight, tom: 'primaria' },
]

type Props = {
  aoFechar: () => void
}

export function MenuMais({ aoFechar }: Props) {
  const { abrir } = useFormularios()

  return (
    <BottomSheet titulo="Novo lançamento" aoFechar={aoFechar}>
      <ul className="m-0 flex list-none flex-col p-0">
        {OPCOES.map(({ tipo, rotulo, icone, tom }) => (
          <li key={tipo}>
            <button
              type="button"
              className="flex h-16 w-full items-center gap-3 rounded-md text-left text-16 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                abrir(tipo)
                aoFechar()
              }}
            >
              <IconeQuadrado icone={icone} tom={tom} />
              <span className="flex-1">{rotulo}</span>
              <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  )
}
