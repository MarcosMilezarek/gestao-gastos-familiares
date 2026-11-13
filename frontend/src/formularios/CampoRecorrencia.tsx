import { useId } from 'react'
import { Campo } from '../componentes/Campo'
import css from './formularios.module.css'

// `null` no pai significa "não recorrente". `meses` fica como texto (campo numérico); a faixa de 2 a 60 é validada no servidor.
export type ValorRecorrencia = { modo: 'sem_fim' } | { modo: 'n_meses'; meses: string }

type Props = {
  valor: ValorRecorrencia | null
  aoMudar(valor: ValorRecorrencia | null): void
  erro?: string
}

export function CampoRecorrencia({ valor, aoMudar, erro }: Props) {
  const idGrupo = useId()
  const ligada = valor !== null

  return (
    <div className={css.campos}>
      <Campo rotulo="Recorrente" erro={erro}>
        <button
          type="button"
          className={css.atalho}
          role="switch"
          aria-checked={ligada}
          onClick={() => aoMudar(ligada ? null : { modo: 'sem_fim' })}
        >
          {ligada ? 'Ligado' : 'Desligado'}
        </button>
      </Campo>

      {valor && (
        <fieldset className={css.grupo}>
          <legend className={css.rotulo}>Repetição</legend>
          <label className={css.opcao}>
            <input
              type="radio"
              name={idGrupo}
              checked={valor.modo === 'sem_fim'}
              onChange={() => aoMudar({ modo: 'sem_fim' })}
            />
            Mensal, sem data de fim
          </label>
          <label className={css.opcao}>
            <input
              type="radio"
              name={idGrupo}
              checked={valor.modo === 'n_meses'}
              onChange={() => aoMudar({ modo: 'n_meses', meses: '' })}
            />
            Repetir N meses
          </label>
          {valor.modo === 'n_meses' && (
            <Campo rotulo="Número de meses">
              <input
                className={css.controle}
                type="number"
                inputMode="numeric"
                min={2}
                max={60}
                value={valor.meses}
                onChange={(e) => aoMudar({ modo: 'n_meses', meses: e.target.value })}
              />
            </Campo>
          )}
        </fieldset>
      )}
    </div>
  )
}
