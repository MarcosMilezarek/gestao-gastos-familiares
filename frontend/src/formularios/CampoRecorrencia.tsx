import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { Campo } from '../componentes/Campo'

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
    <div className="flex flex-col gap-4">
      <Campo rotulo="Recorrente" erro={erro}>
        <Switch
          checked={ligada}
          onCheckedChange={(marcado) => aoMudar(marcado ? { modo: 'sem_fim' } : null)}
        />
      </Campo>

      {valor && (
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-14 font-medium">Repetição</legend>
          <RadioGroup
            value={valor.modo}
            onValueChange={(modo) =>
              aoMudar(modo === 'sem_fim' ? { modo: 'sem_fim' } : { modo: 'n_meses', meses: '' })
            }
          >
            <div className="flex min-h-11 items-center gap-3">
              <RadioGroupItem id={`${idGrupo}-sem-fim`} value="sem_fim" />
              <Label htmlFor={`${idGrupo}-sem-fim`}>Mensal, sem data de fim</Label>
            </div>
            <div className="flex min-h-11 items-center gap-3">
              <RadioGroupItem id={`${idGrupo}-n-meses`} value="n_meses" />
              <Label htmlFor={`${idGrupo}-n-meses`}>Repetir N meses</Label>
            </div>
          </RadioGroup>
          {valor.modo === 'n_meses' && (
            <Campo rotulo="Número de meses">
              <Input
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
