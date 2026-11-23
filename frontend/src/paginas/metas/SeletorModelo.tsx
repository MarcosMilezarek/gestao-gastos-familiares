import { Button } from '@/components/ui/button'
import { MODELOS_META, type ModeloMeta } from './modelosMeta'

type SeletorModeloProps = { aoEscolher(modelo: ModeloMeta): void }

// Modelos sugeridos na criação de meta (RF-6.02). Escolher um só preenche; nada fica guardado.
export function SeletorModelo({ aoEscolher }: SeletorModeloProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-14 font-medium text-foreground">Modelo</legend>
      <div className="flex flex-wrap gap-2">
        {MODELOS_META.map((modelo) => (
          <Button
            key={modelo.rotulo}
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => aoEscolher(modelo)}
          >
            {modelo.rotulo}
          </Button>
        ))}
      </div>
    </fieldset>
  )
}
