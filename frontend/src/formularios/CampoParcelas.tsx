import { Campo } from '../componentes/Campo'
import css from './formularios.module.css'

// `null` no pai significa "não parcelada". `valor` fica como texto (campo numérico); a faixa de 2 a 36 é validada no servidor.
type Props = {
  valor: string | null
  aoMudar(valor: string | null): void
  erro?: string
}

export function CampoParcelas({ valor, aoMudar, erro }: Props) {
  const ligada = valor !== null

  return (
    <div className={css.campos}>
      <Campo rotulo="Parcelada" erro={erro}>
        <button
          type="button"
          className={css.atalho}
          role="switch"
          aria-checked={ligada}
          onClick={() => aoMudar(ligada ? null : '')}
        >
          {ligada ? 'Ligado' : 'Desligado'}
        </button>
      </Campo>

      {valor !== null && (
        <Campo rotulo="Número de parcelas">
          <input
            className={css.controle}
            type="number"
            inputMode="numeric"
            min={2}
            max={36}
            value={valor}
            onChange={(e) => aoMudar(e.target.value)}
          />
        </Campo>
      )}
    </div>
  )
}
