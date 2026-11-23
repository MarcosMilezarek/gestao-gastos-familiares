import type { ComponentProps } from 'react'
import { Link } from 'react-router'
import { CircleCheck, CircleDashed, CircleMinus, Lock, TriangleAlert, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { CartaoSaida, FaturaStatus } from '../api/cartoes'
import { formatarData } from '../formatacao/data'
import { eZero } from '../formatacao/dinheiro'
import { formatarPercentual } from '../formatacao/percentual'
import { Dinheiro } from './Dinheiro'

type CardCartaoProps = { cartao: CartaoSaida }

type VarianteBadge = ComponentProps<typeof Badge>['variant']

// Status da fatura: ícone e texto, além da cor (RNF-08).
const STATUS: Record<FaturaStatus, { rotulo: string; Icone: LucideIcon; variante: VarianteBadge }> = {
  aberta: { rotulo: 'Aberta', Icone: CircleDashed, variante: 'info' },
  fechada: { rotulo: 'Fechada', Icone: Lock, variante: 'alerta' },
  vencida: { rotulo: 'Vencida', Icone: TriangleAlert, variante: 'destructive' },
  zerada: { rotulo: 'Zerada', Icone: CircleMinus, variante: 'outline' },
  paga: { rotulo: 'Paga', Icone: CircleCheck, variante: 'entrada' },
}

// Fatura do mês corrente ainda por pagar, com valor e conta ativa.
function podePagar(cartao: CartaoSaida): boolean {
  const fatura = cartao.fatura_corrente
  return (
    fatura.pagamento === null &&
    fatura.status !== 'paga' &&
    fatura.status !== 'zerada' &&
    !eZero(fatura.valor) &&
    !cartao.conta_arquivada
  )
}

const ROTULO = 'text-13 text-muted-foreground'
const VALOR = 'text-14 font-semibold tabular-nums'

export function CardCartao({ cartao }: CardCartaoProps) {
  const fatura = cartao.fatura_corrente
  const { rotulo, Icone, variante } = STATUS[fatura.status]
  const uso = cartao.uso_porcentagem

  return (
    <article>
      <Card>
        <header className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 text-16 font-semibold">
            <Link
              to={`/cartoes/${cartao.id}/faturas/${fatura.mes}`}
              className="inline-flex min-h-11 items-center rounded-sm ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {cartao.nome}
            </Link>
          </h2>
          <Badge variant={variante} className="mt-2.5">
            <Icone aria-hidden="true" />
            {rotulo}
          </Badge>
        </header>
        <dl className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <dt className={ROTULO}>Valor da fatura</dt>
            <dd className={VALOR}>
              <Dinheiro valor={fatura.valor} />
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className={ROTULO}>Vencimento</dt>
            <dd className={VALOR}>
              <time dateTime={fatura.vencimento}>{formatarData(fatura.vencimento)}</time>
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className={ROTULO}>Disponível</dt>
            <dd className={VALOR}>
              <Dinheiro valor={cartao.limite_disponivel} />
            </dd>
          </div>
        </dl>
        <div className="flex flex-col gap-2">
          {uso !== null && (
            <Progress
              value={Math.min(100, Math.max(0, Number(uso)))}
              tom={Number(uso) >= 100 ? 'saida' : 'primary'}
              aria-label="Limite usado"
            />
          )}
          <p className="text-13 tabular-nums text-muted-foreground">
            <Dinheiro valor={cartao.limite_usado} /> usado de <Dinheiro valor={cartao.limite} />
            {uso !== null && <span>{` · ${formatarPercentual(uso)}`}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {podePagar(cartao) && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/cartoes/${cartao.id}/faturas/${fatura.mes}?pagar=1`}>Pagar fatura</Link>
            </Button>
          )}
          <Button asChild variant="secondary" size="sm">
            <Link to={`/cartoes/${cartao.id}`}>Editar cartão</Link>
          </Button>
        </div>
      </Card>
    </article>
  )
}
