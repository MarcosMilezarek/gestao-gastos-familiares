import { Landmark } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dinheiro } from './Dinheiro'
import { IconeQuadrado } from './IconeQuadrado'

type CardContaProps = {
  nome: string
  instituicao: string | null
  saldoAtual: string
  saldoPrevisto: string
  onVerLancamentos(): void
  // Ações de edição ficam ligadas pela tela de contas (fatia-2.md §5.3, 2.F4); sem callback, o botão não aparece.
  onEditar?(): void
  onReajustar?(): void
  onArquivar?(): void
}

export function CardConta({
  nome,
  instituicao,
  saldoAtual,
  saldoPrevisto,
  onVerLancamentos,
  onEditar,
  onReajustar,
  onArquivar,
}: CardContaProps) {
  return (
    <article className="flex flex-col gap-4 rounded-xl border bg-card p-5 text-card-foreground shadow-card">
      <header className="flex items-center gap-3">
        <IconeQuadrado icone={Landmark} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-16 font-semibold">{nome}</h2>
          {instituicao && <p className="truncate text-14 text-muted-foreground">{instituicao}</p>}
        </div>
      </header>
      <dl className="grid grid-cols-2 gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-13 text-muted-foreground">Saldo atual</dt>
          <dd className="m-0 truncate">
            <Dinheiro valor={saldoAtual} />
          </dd>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-13 text-muted-foreground">Saldo previsto</dt>
          <dd className="m-0 truncate">
            <Dinheiro valor={saldoPrevisto} />
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onVerLancamentos}>
          Ver lançamentos
        </Button>
        {onEditar && (
          <Button variant="ghost" size="sm" onClick={onEditar}>
            Editar
          </Button>
        )}
        {onReajustar && (
          <Button variant="ghost" size="sm" onClick={onReajustar}>
            Reajustar
          </Button>
        )}
        {onArquivar && (
          <Button variant="ghost" size="sm" onClick={onArquivar}>
            Arquivar
          </Button>
        )}
      </div>
    </article>
  )
}
