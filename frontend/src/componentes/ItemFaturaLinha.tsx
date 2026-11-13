import { formatarData } from '../formatacao/data'
import { Dinheiro } from './Dinheiro'
import styles from './lancamentos.module.css'

// Forma mínima do item da fatura que a linha exibe (subconjunto de ItemFaturaSaida).
export type ItemFaturaLinhaItem = {
  id: number
  tipo: 'compra' | 'estorno' | 'ajuste'
  valor: string
  data: string
  descricao: string
  categoria: { nome: string; pai_nome: string | null } | null
}

type ItemFaturaLinhaProps = {
  item: ItemFaturaLinhaItem
  aoEditar?: () => void
  aoExcluir?: () => void
}

const TIPO_DINHEIRO: Record<ItemFaturaLinhaItem['tipo'], 'saida' | 'neutro'> = {
  compra: 'saida',
  estorno: 'neutro',
  ajuste: 'neutro',
}

function rotuloCategoria(item: ItemFaturaLinhaItem): string | null {
  if (item.tipo === 'ajuste') return 'Reajuste de fatura'
  const categoria = item.categoria
  if (!categoria) return null
  return categoria.pai_nome ? `${categoria.pai_nome} > ${categoria.nome}` : categoria.nome
}

// Ajuste não tem "Editar" (só exclusão, D9). Ações só chegam quando a fatura é editável.
export function ItemFaturaLinha({ item, aoEditar, aoExcluir }: ItemFaturaLinhaProps) {
  const categoria = rotuloCategoria(item)

  return (
    <li className={styles.item}>
      <div className={styles.abrir}>
        <span className={styles.principal}>{item.descricao}</span>
        <span className={styles.secundario}>
          <time dateTime={item.data}>{formatarData(item.data)}</time>
          {categoria && ` · ${categoria}`}
        </span>
      </div>
      <Dinheiro valor={item.valor} tipo={TIPO_DINHEIRO[item.tipo]} />
      {(aoEditar || aoExcluir) && (
        <div className={styles.acoes}>
          {aoEditar && item.tipo !== 'ajuste' && (
            <button type="button" className={styles.acao} onClick={aoEditar}>
              Editar
            </button>
          )}
          {aoExcluir && (
            <button type="button" className={styles.acao} onClick={aoExcluir}>
              Excluir
            </button>
          )}
        </div>
      )}
    </li>
  )
}
