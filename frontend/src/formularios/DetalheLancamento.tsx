import type { LancamentoSaida } from '../api/lancamentos'
import { BottomSheet } from '../componentes/BottomSheet'
import css from './formularios.module.css'

type Props = { lancamento: LancamentoSaida; aoFechar(): void }

export function DetalheLancamento({ lancamento, aoFechar }: Props) {
  return (
    <BottomSheet titulo="Detalhes do lançamento" aoFechar={aoFechar}>
      <div className={css.campos}>
        <div className={css.grupo}>
          <span className={css.rotulo}>Tags</span>
          {lancamento.tags.length > 0 ? (
            <div className={css.tags}>
              {lancamento.tags.map((tag) => (
                <span key={tag.id}>{tag.nome}</span>
              ))}
            </div>
          ) : (
            <p>Sem tags</p>
          )}
        </div>

        <div className={css.grupo}>
          <span className={css.rotulo}>Observação</span>
          <p>{lancamento.observacao ?? 'Sem observação'}</p>
        </div>

        <p>Criado por {lancamento.criado_por.nome}</p>
      </div>
    </BottomSheet>
  )
}
