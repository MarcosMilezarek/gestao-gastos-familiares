import { Button } from '@/components/ui/button'
import { BottomSheet } from './BottomSheet'

export type Alcance = 'somente_este' | 'este_e_pendentes' | 'todos'

type Props = {
  aberto: boolean
  acao: 'editar' | 'excluir'
  onEscolher: (alcance: Alcance) => void
  onCancelar: () => void
  // Textos próprios (ex.: compra no cartão, RF-4.11). Sem eles, os textos padrão.
  titulo?: string
  rotulos?: Record<Alcance, string>
}

const opcoes: { alcance: Alcance; rotulo: string }[] = [
  { alcance: 'somente_este', rotulo: 'Somente este' },
  { alcance: 'este_e_pendentes', rotulo: 'Este e os pendentes' },
  { alcance: 'todos', rotulo: 'Todos (incluindo confirmados)' },
]

// Escolha do alcance de edição ou exclusão de lançamento recorrente.
// Montado só enquanto aberto: o BottomSheet cuida de foco, Esc e aria-modal.
export function DialogoAlcance({
  aberto,
  acao,
  onEscolher,
  onCancelar,
  titulo,
  rotulos,
}: Props) {
  if (!aberto) return null

  return (
    <BottomSheet
      titulo={
        titulo ??
        (acao === 'excluir' ? 'Excluir lançamento recorrente' : 'Editar lançamento recorrente')
      }
      aoFechar={onCancelar}
      rodape={
        <Button type="button" variant="outline" size="lg" onClick={onCancelar}>
          Cancelar
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {opcoes.map((opcao) => (
          <Button
            key={opcao.alcance}
            type="button"
            variant="secondary"
            size="lg"
            onClick={() => onEscolher(opcao.alcance)}
          >
            {rotulos?.[opcao.alcance] ?? opcao.rotulo}
          </Button>
        ))}
      </div>
    </BottomSheet>
  )
}
