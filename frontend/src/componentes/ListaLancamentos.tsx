import { useState } from 'react'
import { CircleCheck, CircleDashed, CircleMinus, CreditCard, Lock, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { FaturaResumo, FaturaStatus } from '../api/cartoes'
import type { DiaLista, ItemLancamentoLista } from '../api/controle'
import { formatarData } from '../formatacao/data'
import { type Alcance, DialogoAlcance } from './DialogoAlcance'
import { Dinheiro } from './Dinheiro'
import { EstadoVazio } from './EstadoVazio'
import { ItemLancamento, type LancamentoItem } from './ItemLancamento'
import styles from './lancamentos.module.css'

type ListaLancamentosProps = {
  dias: DiaLista[]
  aoConfirmar?: (item: LancamentoItem) => void
  aoEditar?: (item: LancamentoItem, alcance?: Alcance) => void
  aoExcluir?: (item: LancamentoItem, alcance?: Alcance) => void
  aoAbrir?: (item: LancamentoItem) => void
  aoAbrirFatura?: (fatura: FaturaResumo) => void
  aoNovo?: () => void
}

// Status da fatura: ícone e texto, além da cor (RNF-08). Mesmo mapa de CardCartao.tsx.
const STATUS_FATURA: Record<FaturaStatus, { rotulo: string; Icone: LucideIcon }> = {
  aberta: { rotulo: 'Aberta', Icone: CircleDashed },
  fechada: { rotulo: 'Fechada', Icone: Lock },
  vencida: { rotulo: 'Vencida', Icone: TriangleAlert },
  zerada: { rotulo: 'Zerada', Icone: CircleMinus },
  paga: { rotulo: 'Paga', Icone: CircleCheck },
}

function paraLancamentoItem(item: ItemLancamentoLista): LancamentoItem {
  return {
    ...item.lancamento,
    rotulo: item.rotulo,
    conta_nome: item.conta_nome,
    conta_destino_nome: item.conta_destino_nome,
  }
}

export function ListaLancamentos({
  dias,
  aoConfirmar,
  aoEditar,
  aoExcluir,
  aoAbrir,
  aoAbrirFatura,
  aoNovo,
}: ListaLancamentosProps) {
  // Ação aguardando a escolha do alcance (só para lançamento recorrente).
  const [pendente, setPendente] = useState<{ item: LancamentoItem; acao: 'editar' | 'excluir' } | null>(null)

  function acionar(item: LancamentoItem, acao: 'editar' | 'excluir') {
    if (item.recorrente) {
      setPendente({ item, acao })
      return
    }
    if (acao === 'editar') aoEditar?.(item)
    else aoExcluir?.(item)
  }

  function escolherAlcance(alcance: Alcance) {
    if (!pendente) return
    const { item, acao } = pendente
    setPendente(null)
    if (acao === 'editar') aoEditar?.(item, alcance)
    else aoExcluir?.(item, alcance)
  }

  if (dias.length === 0) {
    return (
      <EstadoVazio
        frase="Nenhum lançamento para mostrar."
        acaoRotulo={aoNovo && 'Novo lançamento'}
        onAcao={aoNovo}
      />
    )
  }

  return (
    <div className={styles.lista}>
      {dias.map((dia) => (
        <section key={dia.data}>
          <h2 className={styles.data}>{formatarData(dia.data)}</h2>
          <ul className={styles.itens}>
            {dia.itens.map((linha) => {
              if (linha.kind === 'fatura') {
                const { fatura } = linha
                const { rotulo, Icone } = STATUS_FATURA[fatura.status]
                const conteudo = (
                  <>
                    <span className={styles.principal}>
                      <CreditCard aria-hidden="true" size={16} /> {fatura.cartao_nome}
                    </span>
                    <span className={styles.secundario}>Fatura do cartão</span>
                    <span className={styles.meta}>
                      <Icone aria-hidden="true" size={16} />
                      {rotulo}
                    </span>
                  </>
                )
                return (
                  <li key={`fatura-${fatura.cartao_id}-${fatura.mes}`} className={styles.item}>
                    {aoAbrirFatura ? (
                      <button type="button" className={styles.abrir} onClick={() => aoAbrirFatura(fatura)}>
                        {conteudo}
                      </button>
                    ) : (
                      <div className={styles.abrir}>{conteudo}</div>
                    )}
                    <Dinheiro valor={fatura.valor} tipo="saida" />
                  </li>
                )
              }

              const item = paraLancamentoItem(linha)
              return (
                <ItemLancamento
                  key={item.id}
                  item={item}
                  aoConfirmar={aoConfirmar && (() => aoConfirmar(item))}
                  aoEditar={aoEditar && (() => acionar(item, 'editar'))}
                  aoExcluir={aoExcluir && (() => acionar(item, 'excluir'))}
                  aoAbrir={aoAbrir && (() => aoAbrir(item))}
                />
              )
            })}
          </ul>
          <p className={styles.saldoDia}>
            Saldo do fim do dia: <Dinheiro valor={dia.saldo_fim_do_dia} />
          </p>
        </section>
      ))}
      <DialogoAlcance
        aberto={pendente !== null}
        acao={pendente?.acao ?? 'editar'}
        onEscolher={escolherAlcance}
        onCancelar={() => setPendente(null)}
      />
    </div>
  )
}
