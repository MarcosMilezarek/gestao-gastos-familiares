import { ChevronRight, PiggyBank, Shuffle, Target } from 'lucide-react'
import { Link } from 'react-router'
import { Card } from '@/components/ui/card'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { IconeQuadrado } from '../../componentes/IconeQuadrado'

// Exatamente 3 entradas (fatia-7.md §5.1, CA-7.02).
const ENTRADAS = [
  { rotulo: 'Orçamento do mês', caminho: '/planejamento/orcamento', icone: PiggyBank },
  { rotulo: 'Cenários', caminho: '/planejamento/cenarios', icone: Shuffle },
  { rotulo: 'Plano de metas', caminho: '/planejamento/plano-de-metas', icone: Target },
]

// Menu da aba Planejamento (RF-7.02): só links para as telas da fatia.
export function Planejamento() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <CabecalhoTela titulo="Planejamento" />

      <nav aria-label="Planejamento">
        <ul className="flex flex-col gap-3">
          {ENTRADAS.map((entrada) => (
            <li key={entrada.caminho}>
              <Link
                to={entrada.caminho}
                className="block rounded-xl outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Card className="min-h-16 flex-row items-center gap-3 p-4">
                  <IconeQuadrado icone={entrada.icone} />
                  <span className="min-w-0 flex-1 text-16 font-semibold">{entrada.rotulo}</span>
                  <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
