import { ChevronRight, Shapes, Tag, Wallet, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { BottomSheet } from './BottomSheet'
import { IconeQuadrado } from './IconeQuadrado'

const LINKS: { para: string; rotulo: string; icone: LucideIcon }[] = [
  { para: '/controle/contas', rotulo: 'Contas', icone: Wallet },
  { para: '/controle/categorias', rotulo: 'Categorias', icone: Shapes },
  { para: '/controle/tags', rotulo: 'Tags', icone: Tag },
]

type Props = {
  aoFechar: () => void
}

export function MenuCadastros({ aoFechar }: Props) {
  return (
    <BottomSheet titulo="Cadastros" aoFechar={aoFechar}>
      <ul className="m-0 flex list-none flex-col p-0">
        {LINKS.map(({ para, rotulo, icone }) => (
          <li key={para}>
            <Link
              to={para}
              onClick={aoFechar}
              className="flex h-16 w-full items-center gap-3 rounded-md text-16 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <IconeQuadrado icone={icone} />
              <span className="flex-1">{rotulo}</span>
              <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </BottomSheet>
  )
}
