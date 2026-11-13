import css from '../../formularios/formularios.module.css'
import { MODELOS_META, type ModeloMeta } from './modelosMeta'

type SeletorModeloProps = { aoEscolher(modelo: ModeloMeta): void }

// Modelos sugeridos na criação de meta (RF-6.02). Escolher um só preenche; nada fica guardado.
export function SeletorModelo({ aoEscolher }: SeletorModeloProps) {
  return (
    <fieldset className={css.grupo}>
      <legend className={css.rotulo}>Modelo</legend>
      <div className={css.atalhos}>
        {MODELOS_META.map((modelo) => (
          <button
            key={modelo.rotulo}
            type="button"
            className={css.atalho}
            onClick={() => aoEscolher(modelo)}
          >
            {modelo.rotulo}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
