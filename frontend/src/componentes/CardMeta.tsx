import { CircleCheck } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import type { MetaSaida } from '../api/metas'
import { formatarData } from '../formatacao/data'
import { formatarPercentual } from '../formatacao/percentual'
import { Dinheiro } from './Dinheiro'
import { iconeDe } from './icones'
import { IconeQuadrado } from './IconeQuadrado'

type CardMetaProps = { meta: MetaSaida }

// Porcentagem em texto ao lado da barra: a informação não depende só da cor (RNF-08).
// A barra usa a porcentagem que a API devolve, limitada a 100.
export function CardMeta({ meta }: CardMetaProps) {
  return (
    <Link
      to={`/metas/${meta.id}`}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-card outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="flex items-center gap-3">
        <span style={meta.cor ? { color: meta.cor } : undefined} className="inline-flex">
          <IconeQuadrado
            icone={iconeDe(meta.icone)}
            className={meta.cor ? 'bg-current/15 text-inherit' : undefined}
          />
        </span>
        <span className="min-w-0 flex-1 truncate text-16 font-semibold">{meta.nome}</span>
        {meta.situacao === 'concluida' && (
          <Badge variant="entrada">
            <CircleCheck aria-hidden="true" />
            Concluída
          </Badge>
        )}
      </span>
      <dl className="grid grid-cols-3 gap-2">
        <div className="min-w-0">
          <dt className="text-13 text-muted-foreground">Valor atual</dt>
          <dd className="text-14 tabular-nums">
            <Dinheiro valor={meta.valor_atual} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-13 text-muted-foreground">Alvo</dt>
          <dd className="text-14 tabular-nums">
            <Dinheiro valor={meta.valor_alvo} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-13 text-muted-foreground">Falta</dt>
          <dd className="text-14 tabular-nums">
            <Dinheiro valor={meta.falta} />
          </dd>
        </div>
      </dl>
      <div className="flex items-center gap-3">
        <Progress aria-label={`Progresso da meta ${meta.nome}`} value={Math.min(100, Number(meta.porcentagem))} />
        <p className="text-13 font-semibold tabular-nums">{formatarPercentual(meta.porcentagem)}</p>
      </div>
      {meta.data_alvo !== null && (
        <p className="text-13 text-muted-foreground tabular-nums">
          Data-alvo: <time dateTime={meta.data_alvo}>{formatarData(meta.data_alvo)}</time>
        </p>
      )}
    </Link>
  )
}
