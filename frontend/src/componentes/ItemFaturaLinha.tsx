import { Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatarData } from '../formatacao/data'
import { Dinheiro } from './Dinheiro'
import { IconeQuadrado } from './IconeQuadrado'

// Forma mínima do item da fatura que a linha exibe (subconjunto de ItemFaturaSaida).
export type ItemFaturaLinhaItem = {
  id: number
  tipo: 'compra' | 'estorno' | 'ajuste'
  valor: string
  data: string
  descricao: string
  categoria: { nome: string; pai_nome: string | null } | null
}

type ItemFaturaLinhaProps = {
  item: ItemFaturaLinhaItem
  aoEditar?: () => void
  aoExcluir?: () => void
}

const TIPO_DINHEIRO: Record<ItemFaturaLinhaItem['tipo'], 'saida' | 'neutro'> = {
  compra: 'saida',
  estorno: 'neutro',
  ajuste: 'neutro',
}

function rotuloCategoria(item: ItemFaturaLinhaItem): string | null {
  if (item.tipo === 'ajuste') return 'Reajuste de fatura'
  const categoria = item.categoria
  if (!categoria) return null
  return categoria.pai_nome ? `${categoria.pai_nome} > ${categoria.nome}` : categoria.nome
}

// Ajuste não tem "Editar" (só exclusão, D9). Ações só chegam quando a fatura é editável.
export function ItemFaturaLinha({ item, aoEditar, aoExcluir }: ItemFaturaLinhaProps) {
  const categoria = rotuloCategoria(item)
  const tipoDinheiro = TIPO_DINHEIRO[item.tipo]

  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-3">
      <div className="flex min-h-11 items-center gap-3">
        <IconeQuadrado icone={Receipt} tom={tipoDinheiro === 'saida' ? 'saida' : 'primaria'} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-16 font-semibold text-foreground">{item.descricao}</span>
          <span className="truncate text-13 text-muted-foreground">
            <time dateTime={item.data} className="tabular-nums">
              {formatarData(item.data)}
            </time>
            {categoria && ` · ${categoria}`}
          </span>
        </div>
        <span className="shrink-0 text-16">
          <Dinheiro valor={item.valor} tipo={tipoDinheiro} />
        </span>
      </div>
      {(aoEditar || aoExcluir) && (
        <div className="flex flex-wrap gap-2">
          {aoEditar && item.tipo !== 'ajuste' && (
            <Button type="button" variant="outline" size="sm" onClick={aoEditar}>
              Editar
            </Button>
          )}
          {aoExcluir && (
            <Button type="button" variant="outline" size="sm" onClick={aoExcluir}>
              Excluir
            </Button>
          )}
        </div>
      )}
    </li>
  )
}
