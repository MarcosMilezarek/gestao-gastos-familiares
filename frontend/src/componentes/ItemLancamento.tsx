import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Repeat, TriangleAlert, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Dinheiro } from './Dinheiro'
import { IconeQuadrado } from './IconeQuadrado'
import { SituacaoIcone } from './SituacaoIcone'

type Tipo = 'despesa' | 'receita' | 'transferencia' | 'reajuste' | 'aplicacao' | 'resgate'
type Situacao = 'confirmada' | 'prevista' | 'atrasada'

// Forma mínima do lançamento que a lista exibe (subconjunto de LancamentoSaida).
export type LancamentoItem = {
  id: number
  tipo: Tipo
  valor: string
  data: string
  situacao: Situacao
  descricao: string | null
  categoria: { nome: string; pai_nome: string | null } | null
  aporte: boolean
  recorrente: boolean
  tags: { id: number; nome: string }[]
  rotulo: string
  conta_nome: string | null
  conta_destino_nome: string | null
  meta: null | { id: number; nome: string }
}

type ItemLancamentoProps = {
  item: LancamentoItem
  aoConfirmar?: () => void
  aoEditar?: () => void
  aoExcluir?: () => void
  aoAbrir?: () => void
}

type TipoValor = 'entrada' | 'saida' | 'neutro'

const TIPO_DINHEIRO: Record<Tipo, TipoValor> = {
  despesa: 'saida',
  receita: 'entrada',
  transferencia: 'neutro',
  reajuste: 'neutro',
  aplicacao: 'saida',
  resgate: 'entrada',
}

const ICONE_TIPO: Record<TipoValor, { Icone: LucideIcon; tom: 'entrada' | 'saida' | 'primaria' }> = {
  entrada: { Icone: ArrowDownLeft, tom: 'entrada' },
  saida: { Icone: ArrowUpRight, tom: 'saida' },
  neutro: { Icone: ArrowLeftRight, tom: 'primaria' },
}

function rotuloCategoria(categoria: LancamentoItem['categoria']): string | null {
  if (!categoria) return null
  return categoria.pai_nome ? `${categoria.pai_nome} > ${categoria.nome}` : categoria.nome
}

// Conta de origem; transferência mostra também o destino. Nome nulo = conta não visível (I-N2).
function rotuloContas(item: LancamentoItem): string {
  const origem = item.conta_nome ?? 'Conta externa'
  if (item.tipo !== 'transferencia') return origem
  return `${origem} → ${item.conta_destino_nome ?? 'Conta externa'}`
}

export function ItemLancamento({ item, aoConfirmar, aoEditar, aoExcluir, aoAbrir }: ItemLancamentoProps) {
  const categoria = rotuloCategoria(item.categoria)
  const tipoDinheiro = TIPO_DINHEIRO[item.tipo]
  const { Icone, tom } =
    item.situacao === 'atrasada' ? { Icone: TriangleAlert, tom: 'alerta' as const } : ICONE_TIPO[tipoDinheiro]
  // Item a confirmar: com a ação disponível e ainda não confirmado.
  const confirmar = aoConfirmar !== undefined && item.situacao !== 'confirmada'
  const temMarcas = item.recorrente || item.aporte || item.tags.length > 0
  const classesCorpo = 'flex min-h-11 w-full flex-col gap-2 text-left'

  const conteudo = (
    <>
      <span className="flex items-center gap-3">
        <IconeQuadrado icone={Icone} tom={tom} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-16 font-semibold text-foreground">{item.descricao ?? item.rotulo}</span>
          <span className="truncate text-13 text-muted-foreground">
            {item.rotulo}
            {item.meta && ` · ${item.meta.nome}`}
            {categoria && ` · ${categoria}`}
            {` · ${rotuloContas(item)}`}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 text-16">
          <Dinheiro valor={item.valor} tipo={tipoDinheiro} />
          <SituacaoIcone situacao={item.situacao} />
        </span>
      </span>
      {temMarcas && (
        <span className="flex flex-wrap items-center gap-2">
          {item.recorrente && (
            <Badge variant="outline">
              <Repeat aria-hidden="true" />
              Recorrente
            </Badge>
          )}
          {item.aporte && <Badge variant="secondary">Aporte</Badge>}
          {item.tags.map((tag) => (
            <Badge key={tag.id} variant="secondary">
              {tag.nome}
            </Badge>
          ))}
        </span>
      )}
    </>
  )

  return (
    <li className={cn('flex flex-col gap-3 py-3', confirmar && 'rounded-xl bg-primary-suave p-3')}>
      {aoAbrir ? (
        <button type="button" className={cn(classesCorpo, 'cursor-pointer')} onClick={aoAbrir}>
          {conteudo}
        </button>
      ) : (
        <div className={classesCorpo}>{conteudo}</div>
      )}
      <div className="flex flex-wrap gap-2 empty:hidden">
        {confirmar && (
          <Button type="button" variant="secondary" size="sm" onClick={aoConfirmar}>
            Confirmar
          </Button>
        )}
        {item.meta ? (
          <Button asChild variant="outline" size="sm">
            <Link to={`/metas/${item.meta.id}`}>Abrir meta</Link>
          </Button>
        ) : (
          <>
            {aoEditar && item.tipo !== 'reajuste' && (
              <Button type="button" variant="outline" size="sm" onClick={aoEditar}>
                Editar
              </Button>
            )}
            {aoExcluir && (
              <Button type="button" variant="outline" size="sm" onClick={aoExcluir}>
                Excluir
              </Button>
            )}
          </>
        )}
      </div>
    </li>
  )
}
