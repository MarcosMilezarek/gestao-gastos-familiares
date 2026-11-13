import { Repeat } from 'lucide-react'
import { Link } from 'react-router'
import { Dinheiro } from './Dinheiro'
import { SituacaoIcone } from './SituacaoIcone'
import styles from './lancamentos.module.css'

type Tipo = 'despesa' | 'receita' | 'transferencia' | 'reajuste' | 'aplicacao' | 'resgate'
type Situacao = 'confirmada' | 'prevista' | 'atrasada'

// Forma mínima do lançamento que a lista exibe (subconjunto de LancamentoSaida).
export type LancamentoItem = {
  id: number
  tipo: Tipo
  valor: string
  data: string
  situacao: Situacao
  descricao: string | null
  categoria: { nome: string; pai_nome: string | null } | null
  aporte: boolean
  recorrente: boolean
  tags: { id: number; nome: string }[]
  rotulo: string
  conta_nome: string | null
  conta_destino_nome: string | null
  meta: null | { id: number; nome: string }
}

type ItemLancamentoProps = {
  item: LancamentoItem
  aoConfirmar?: () => void
  aoEditar?: () => void
  aoExcluir?: () => void
  aoAbrir?: () => void
}

const TIPO_DINHEIRO: Record<Tipo, 'entrada' | 'saida' | 'neutro'> = {
  despesa: 'saida',
  receita: 'entrada',
  transferencia: 'neutro',
  reajuste: 'neutro',
  aplicacao: 'saida',
  resgate: 'entrada',
}

function rotuloCategoria(categoria: LancamentoItem['categoria']): string | null {
  if (!categoria) return null
  return categoria.pai_nome ? `${categoria.pai_nome} > ${categoria.nome}` : categoria.nome
}

// Conta de origem; transferência mostra também o destino. Nome nulo = conta não visível (I-N2).
function rotuloContas(item: LancamentoItem): string {
  const origem = item.conta_nome ?? 'Conta externa'
  if (item.tipo !== 'transferencia') return origem
  return `${origem} → ${item.conta_destino_nome ?? 'Conta externa'}`
}

export function ItemLancamento({ item, aoConfirmar, aoEditar, aoExcluir, aoAbrir }: ItemLancamentoProps) {
  const categoria = rotuloCategoria(item.categoria)
  const conteudo = (
    <>
      <span className={styles.principal}>{item.descricao ?? item.rotulo}</span>
      <span className={styles.secundario}>
        {item.rotulo}
        {item.meta && ` · ${item.meta.nome}`}
        {categoria && ` · ${categoria}`}
        {` · ${rotuloContas(item)}`}
      </span>
      <span className={styles.meta}>
        <SituacaoIcone situacao={item.situacao} />
        {item.recorrente && (
          <span className={styles.recorrente}>
            <Repeat aria-hidden="true" size={16} />
            Recorrente
          </span>
        )}
        {item.aporte && <span className={styles.tag}>Aporte</span>}
        {item.tags.map((tag) => (
          <span key={tag.id} className={styles.tag}>
            {tag.nome}
          </span>
        ))}
      </span>
    </>
  )

  return (
    <li className={styles.item}>
      {aoAbrir ? (
        <button type="button" className={styles.abrir} onClick={aoAbrir}>
          {conteudo}
        </button>
      ) : (
        <div className={styles.abrir}>{conteudo}</div>
      )}
      <Dinheiro valor={item.valor} tipo={TIPO_DINHEIRO[item.tipo]} />
      <div className={styles.acoes}>
        {aoConfirmar && item.situacao !== 'confirmada' && (
          <button type="button" className={styles.acao} onClick={aoConfirmar}>
            Confirmar
          </button>
        )}
        {item.meta ? (
          <Link to={`/metas/${item.meta.id}`} className={styles.acao}>
            Abrir meta
          </Link>
        ) : (
          <>
            {aoEditar && item.tipo !== 'reajuste' && (
              <button type="button" className={styles.acao} onClick={aoEditar}>
                Editar
              </button>
            )}
            {aoExcluir && (
              <button type="button" className={styles.acao} onClick={aoExcluir}>
                Excluir
              </button>
            )}
          </>
        )}
      </div>
    </li>
  )
}
