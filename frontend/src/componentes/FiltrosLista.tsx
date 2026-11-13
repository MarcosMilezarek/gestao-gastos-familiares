import { useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import type { TipoLista } from '../api/controle'
import type { SituacaoLancamento } from '../api/lancamentos'
import type { AtalhoTipo, ChaveFiltro, ControleFiltros, Rascunho } from '../hooks/useFiltros'
import { BottomSheet } from './BottomSheet'
import estado from './estado.module.css'
import estilos from './filtros.module.css'

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
    <fieldset className={estilos.grupo}>
      <legend className={estilos.legenda}>{titulo}</legend>
      {opcoes.map((o) => (
        <label key={String(o.valor)} className={estilos.opcao}>
          <input
            type="checkbox"
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
    <div className={estilos.bloco}>
      <div className={estilos.barra}>
        <div className={estilos.rolagem} role="group" aria-label="Tipo de lançamento">
          {ATALHOS_TELA.map((a) => (
            <button
              key={a.id}
              type="button"
              className={
                atalho === a.id ? `${estilos.chip} ${estilos.chipAtivo}` : estilos.chip
              }
              aria-pressed={atalho === a.id}
              onClick={() => escolherAtalho(a.id)}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={estilos.botaoFiltros}
          onClick={abrirSheet}
        >
          <SlidersHorizontal aria-hidden="true" />
          Filtros
        </button>
      </div>

      {ativos && (
        <div className={estilos.barra}>
          <div className={estilos.rolagem}>
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                className={estilos.chipRemovivel}
                aria-label={`Remover filtro ${c.rotulo}`}
                onClick={c.remover}
              >
                {c.rotulo}
                <X aria-hidden="true" />
              </button>
            ))}
          </div>
          <button type="button" className={estilos.limpar} onClick={limpar}>
            Limpar filtros
          </button>
        </div>
      )}

      {sheetAberto && (
        <BottomSheet
          titulo="Filtros"
          aoFechar={() => setSheetAberto(false)}
          rodape={
            <button type="button" className={estado.acao} onClick={aplicarRascunho}>
              Aplicar
            </button>
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
