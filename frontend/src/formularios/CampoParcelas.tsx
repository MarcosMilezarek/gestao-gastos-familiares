import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Campo } from '../componentes/Campo'

// `null` no pai significa "não parcelada". `valor` fica como texto (campo numérico); a faixa de 2 a 36 é validada no servidor.
type Props = {
  valor: string | null
  aoMudar(valor: string | null): void
  erro?: string
}

export function CampoParcelas({ valor, aoMudar, erro }: Props) {
  const ligada = valor !== null

  return (
    <div className="flex flex-col gap-4">
      <Campo rotulo="Parcelada" erro={erro}>
        <Switch checked={ligada} onCheckedChange={(marcado) => aoMudar(marcado ? '' : null)} />
      </Campo>

      {valor !== null && (
        <Campo rotulo="Número de parcelas">
          <Input
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
