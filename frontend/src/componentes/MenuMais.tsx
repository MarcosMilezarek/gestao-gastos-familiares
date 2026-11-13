import { useFormularios, type TipoFormulario } from '../formularios/FormulariosProvider'
import { BottomSheet } from './BottomSheet'
import styles from './navegacao.module.css'

const OPCOES: { tipo: TipoFormulario; rotulo: string }[] = [
  { tipo: 'despesa', rotulo: 'Despesa' },
  { tipo: 'receita', rotulo: 'Receita' },
  { tipo: 'cartao', rotulo: 'Despesa no cartão' },
  { tipo: 'transferencia', rotulo: 'Aporte/Transferência' },
]

type Props = {
  aoFechar: () => void
}

export function MenuMais({ aoFechar }: Props) {
  const { abrir } = useFormularios()

  return (
    <BottomSheet titulo="Novo lançamento" aoFechar={aoFechar}>
      <ul className={styles.opcoes}>
        {OPCOES.map(({ tipo, rotulo }) => (
          <li key={tipo}>
            <button
              type="button"
              className={styles.opcao}
              onClick={() => {
                abrir(tipo)
                aoFechar()
              }}
            >
              {rotulo}
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  )
}
