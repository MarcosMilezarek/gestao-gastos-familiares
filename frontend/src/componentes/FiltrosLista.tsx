import { useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { TipoLista } from '../api/controle'
import type { SituacaoLancamento } from '../api/lancamentos'
import type { AtalhoTipo, ChaveFiltro, ControleFiltros, Rascunho } from '../hooks/useFiltros'
import { BottomSheet } from './BottomSheet'

type Valor = string | number
type Opcao = { valor: Valor; nome: string }

export type OpcoesFiltros = {
  donos: Opcao[]
  contas: Opcao[]
  categorias: Opcao[]
  cartoes: Opcao[]
}

type Chip = { id: string; rotulo: string; remover(): void }

const ATALHOS_TELA: { id: AtalhoTipo; rotulo: string }[] = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'despesas', rotulo: 'Despesas' },
  { id: 'receitas', rotulo: 'Receitas' },
  { id: 'transferencias', rotulo: 'Transferências' },
]

const TIPOS: { valor: TipoLista; nome: string }[] = [
  { valor: 'despesa_conta', nome: 'Despesa em conta' },
  { valor: 'despesa_cartao', nome: 'Despesa no cartão' },
  { valor: 'receita', nome: 'Receita' },
  { valor: 'transferencia', nome: 'Transferência' },
  { valor: 'aporte', nome: 'Aporte' },
  { valor: 'aplicacao_resgate', nome: 'Aplicação e resgate' },
  { valor: 'reajuste', nome: 'Reajuste de saldo' },
]

const SITUACOES: { valor: SituacaoLancamento; nome: string }[] = [
  { valor: 'confirmada', nome: 'Confirmada' },
  { valor: 'prevista', nome: 'Prevista' },
  { valor: 'atrasada', nome: 'Atrasada' },
]

function nomeDe(opcoes: Opcao[], valor: Valor): string {
  return opcoes.find((o) => o.valor === valor)?.nome ?? String(valor)
}

type GrupoProps = {
  titulo: string
  chave: ChaveFiltro
  opcoes: Opcao[]
  selecionados: ReadonlyArray<Valor>
  mudar: ControleFiltros['mudar']
}

// Multisseleção: marcar ou desmarcar aplica na hora, pela URL.
function Grupo({ titulo, chave, opcoes, selecionados, mudar }: GrupoProps) {
  if (opcoes.length === 0) return null

  return (
    <fieldset className="m-0 mb-4 min-w-0 border-0 p-0">
      <legend className="mb-1 p-0 text-14 font-semibold">{titulo}</legend>
      {opcoes.map((o) => (
        <label key={String(o.valor)} className="flex min-h-11 items-center gap-3 text-16">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={selecionados.includes(o.valor)}
            onChange={(e) =>
              mudar(
                chave,
                e.target.checked
                  ? [...selecionados, o.valor]
                  : selecionados.filter((v) => v !== o.valor),
              )
            }
          />
          {o.nome}
        </label>
      ))}
    </fieldset>
  )
}

type Props = { controle: ControleFiltros; opcoes: OpcoesFiltros }

export function FiltrosLista({ controle, opcoes }: Props) {
  const { filtros, ativos, atalho, mudar, escolherAtalho, limpar, aplicar } = controle
  const [sheetAberto, setSheetAberto] = useState(false)
  // Escolhas do sheet ficam aqui até "Aplicar"; X, Esc e Voltar descartam (reiniciadas ao abrir).
  const [rascunho, setRascunho] = useState<Rascunho>({})

  function abrirSheet() {
    setRascunho(filtros)
    setSheetAberto(true)
  }

  function mudarRascunho(chave: ChaveFiltro, valores: ReadonlyArray<Valor>) {
    setRascunho((atual) => ({ ...atual, [chave]: valores }))
  }

  function aplicarRascunho() {
    // O BottomSheet volta uma entrada no histórico ao fechar, de forma assíncrona:
    // a URL só é gravada depois dessa volta, para não ser desfeita por ela.
    const esperaVolta = history.state?.bottomSheet === true
    setSheetAberto(false)
    if (!esperaVolta) {
      aplicar(rascunho)
      return
    }
    window.addEventListener('popstate', () => aplicar(rascunho), { once: true })
  }

  function chipsDe<V extends Valor>(
    chave: ChaveFiltro,
    valores: ReadonlyArray<V>,
    rotulo: (v: V) => string,
  ): Chip[] {
    return valores.map((valor) => ({
      id: `${chave}:${valor}`,
      rotulo: rotulo(valor),
      remover: () => mudar(chave, valores.filter((v) => v !== valor)),
    }))
  }

  const chips: Chip[] = [
    ...chipsDe('dono', filtros.dono ?? [], (v) => nomeDe(opcoes.donos, v)),
    ...chipsDe('conta_id', filtros.conta_id ?? [], (v) => nomeDe(opcoes.contas, v)),
    ...chipsDe('categoria_id', filtros.categoria_id ?? [], (v) =>
      nomeDe(opcoes.categorias, v),
    ),
    ...chipsDe('tipo', filtros.tipo ?? [], (v) => nomeDe(TIPOS, v)),
    ...chipsDe('cartao_id', filtros.cartao_id ?? [], (v) => nomeDe(opcoes.cartoes, v)),
    ...chipsDe('situacao', filtros.situacao ?? [], (v) => nomeDe(SITUACOES, v)),
  ]

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <ToggleGroup
          type="multiple"
          value={[atalho ?? '']}
          onValueChange={(v) => {
            // Tocar no chip já ligado não desliga: sempre há um atalho de tipo escolhido.
            const novo = v.find((id) => id !== atalho)
            if (novo) escolherAtalho(novo as AtalhoTipo)
          }}
          role="group"
          aria-label="Tipo de lançamento"
          className="min-w-0 flex-1 flex-nowrap overflow-x-auto"
        >
          {ATALHOS_TELA.map((a) => (
            <ToggleGroupItem key={a.id} value={a.id} className="shrink-0">
              {a.rotulo}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={abrirSheet}>
          <SlidersHorizontal aria-hidden="true" />
          Filtros
        </Button>
      </div>

      {ativos && (
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-primary bg-primary-suave px-4 text-14 font-medium text-primary-texto outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={`Remover filtro ${c.rotulo}`}
                onClick={c.remover}
              >
                {c.rotulo}
                <X aria-hidden="true" className="size-4" />
              </button>
            ))}
          </div>
          <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={limpar}>
            Limpar filtros
          </Button>
        </div>
      )}

      {sheetAberto && (
        <BottomSheet
          titulo="Filtros"
          aoFechar={() => setSheetAberto(false)}
          rodape={
            <Button type="button" className="w-full" onClick={aplicarRascunho}>
              Aplicar
            </Button>
          }
        >
          <Grupo
            titulo="Dono"
            chave="dono"
            opcoes={opcoes.donos}
            selecionados={rascunho.dono ?? []}
            mudar={mudarRascunho}
          />
          <Grupo
            titulo="Conta"
            chave="conta_id"
            opcoes={opcoes.contas}
            selecionados={rascunho.conta_id ?? []}
            mudar={mudarRascunho}
          />
          <Grupo
            titulo="Categoria"
            chave="categoria_id"
            opcoes={opcoes.categorias}
            selecionados={rascunho.categoria_id ?? []}
            mudar={mudarRascunho}
          />
          <Grupo
            titulo="Tipo"
            chave="tipo"
            opcoes={TIPOS}
            selecionados={rascunho.tipo ?? []}
            mudar={mudarRascunho}
          />
          <Grupo
            titulo="Cartão"
            chave="cartao_id"
            opcoes={opcoes.cartoes}
            selecionados={rascunho.cartao_id ?? []}
            mudar={mudarRascunho}
          />
          <Grupo
            titulo="Situação"
            chave="situacao"
            opcoes={SITUACOES}
            selecionados={rascunho.situacao ?? []}
            mudar={mudarRascunho}
          />
        </BottomSheet>
      )}
    </div>
  )
}
