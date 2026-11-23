import { useState } from 'react'
import { CircleCheck, CircleDashed, CircleMinus, CreditCard, Lock, TriangleAlert, type LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { FaturaResumo, FaturaStatus } from '../api/cartoes'
import type { DiaLista, ItemLancamentoLista } from '../api/controle'
import { formatarData } from '../formatacao/data'
import { type Alcance, DialogoAlcance } from './DialogoAlcance'
import { Dinheiro } from './Dinheiro'
import { EstadoVazio } from './EstadoVazio'
import { IconeQuadrado } from './IconeQuadrado'
import { ItemLancamento, type LancamentoItem } from './ItemLancamento'

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
    <div className="flex flex-col gap-4">
      {dias.map((dia) => (
        <section key={dia.data} className="flex flex-col gap-2">
          <h2 className="text-14 font-semibold text-muted-foreground tabular-nums">{formatarData(dia.data)}</h2>
          <Card className="gap-0 p-3">
            <ul className="divide-y">
              {dia.itens.map((linha) => {
                if (linha.kind === 'fatura') {
                  const { fatura } = linha
                  const { rotulo, Icone } = STATUS_FATURA[fatura.status]
                  const classesCorpo = 'flex min-h-11 w-full items-center gap-3 text-left'
                  const conteudo = (
                    <>
                      <IconeQuadrado icone={CreditCard} tom="info" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-16 font-semibold text-foreground">{fatura.cartao_nome}</span>
                        <span className="truncate text-13 text-muted-foreground">Fatura do cartão</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1 text-16">
                        <Dinheiro valor={fatura.valor} tipo="saida" />
                        <span className="inline-flex items-center gap-1 text-13 font-medium text-muted-foreground">
                          <Icone aria-hidden="true" className="size-4" />
                          {rotulo}
                        </span>
                      </span>
                    </>
                  )
                  return (
                    <li key={`fatura-${fatura.cartao_id}-${fatura.mes}`} className="py-3">
                      {aoAbrirFatura ? (
                        <button
                          type="button"
                          className={`${classesCorpo} cursor-pointer`}
                          onClick={() => aoAbrirFatura(fatura)}
                        >
                          {conteudo}
                        </button>
                      ) : (
                        <div className={classesCorpo}>{conteudo}</div>
                      )}
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
          </Card>
          <p className="text-right text-14 text-muted-foreground tabular-nums">
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
