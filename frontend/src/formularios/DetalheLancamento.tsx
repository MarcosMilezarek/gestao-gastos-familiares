import type { ReactNode } from 'react'
import type { LancamentoSaida } from '../api/lancamentos'
import { BottomSheet } from '../componentes/BottomSheet'

type Props = { lancamento: LancamentoSaida; aoFechar(): void }

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-3 last:border-b-0">
      <dt className="text-14 text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 text-right text-16 tabular-nums break-words">{children}</dd>
    </div>
  )
}

export function DetalheLancamento({ lancamento, aoFechar }: Props) {
  return (
    <BottomSheet titulo="Detalhes do lançamento" aoFechar={aoFechar}>
      <dl>
        <Linha rotulo="Tags">
          {lancamento.tags.length > 0 ? (
            <span className="flex flex-wrap justify-end gap-2">
              {lancamento.tags.map((tag) => (
                <span key={tag.id}>{tag.nome}</span>
              ))}
            </span>
          ) : (
            'Sem tags'
          )}
        </Linha>
        <Linha rotulo="Observação">{lancamento.observacao ?? 'Sem observação'}</Linha>
        <Linha rotulo="Criado por">{lancamento.criado_por.nome}</Linha>
      </dl>
    </BottomSheet>
  )
}
