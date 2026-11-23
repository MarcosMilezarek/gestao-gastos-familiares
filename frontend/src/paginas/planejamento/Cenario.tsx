import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router'
import {
  excluirItemCenario,
  obterCenario,
  type CenarioSaida,
  type ItemSaida,
} from '../../api/cenarios'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { Dinheiro } from '../../componentes/Dinheiro'
import { DialogoConfirmacao } from '../../componentes/DialogoConfirmacao'
import { TituloBloco } from '../../componentes/TituloBloco'
import { FormItemCenario } from './FormItemCenario'
import { ResultadoCenario } from './ResultadoCenario'

// Formulário aberto pelos botões da tela: adicionar, ou editar um item da lista.
type Formulario = { tipo: 'criar' } | { tipo: 'editar'; item: ItemSaida }

function mensagemErro(erro: unknown): string {
  return erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.'
}

type GrupoItensProps = {
  tipo: 'renda' | 'despesa'
  itens: ItemSaida[]
  aoEditar(item: ItemSaida): void
  aoExcluir(item: ItemSaida): void
}

function GrupoItens({ tipo, itens, aoEditar, aoExcluir }: GrupoItensProps) {
  const rotulo = tipo === 'renda' ? 'Rendas' : 'Despesas'
  const sinal = tipo === 'renda' ? 'entrada' : 'saida'

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-14 font-semibold text-muted-foreground">{rotulo}</h3>
      {itens.length === 0 && (
        <p className="text-14 text-muted-foreground">
          Nenhum item de {tipo === 'renda' ? 'renda' : 'despesa'}.
        </p>
      )}
      <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
        {itens.map((item) => (
          <li key={item.id} className="flex flex-col gap-1 py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <span className="break-words text-16 font-semibold">{item.descricao}</span>
                <span className="text-14 text-muted-foreground">{item.dono_nome}</span>
              </div>
              <Dinheiro valor={item.valor} tipo={sinal} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Editar ${item.descricao}`}
                onClick={() => aoEditar(item)}
              >
                Editar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Excluir ${item.descricao}`}
                onClick={() => aoExcluir(item)}
              >
                Excluir
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Detalhe do cenário (`/planejamento/cenarios/:cenarioId`, fatia-7.md §5.1, 7.F6). Todos os valores vêm do servidor.
export function Cenario() {
  const { cenarioId } = useParams()
  // Número estrito: "12abc", "012" e "1e3" não são ids válidos.
  const id = Number.parseInt(cenarioId ?? '', 10)
  const idValido = Number.isSafeInteger(id) && id > 0 && String(id) === cenarioId
  const queryClient = useQueryClient()
  const [formulario, setFormulario] = useState<Formulario | null>(null)
  const [paraExcluir, setParaExcluir] = useState<ItemSaida | null>(null)

  const consulta = useQuery({
    queryKey: ['cenarios', id],
    queryFn: () => obterCenario(id),
    enabled: idValido,
    retry: repetirSem4xx,
  })
  const cenario = consulta.data
  const naoEncontrado =
    !idValido || (consulta.error instanceof ApiError && consulta.error.status === 404)

  // Cada escrita devolve o cenário já recalculado: vai direto para o cache, sem soma no cliente.
  function atualizarCenario(saida: CenarioSaida) {
    queryClient.setQueryData(['cenarios', id], saida)
    queryClient.invalidateQueries({ queryKey: ['cenarios'], exact: true })
  }

  function aoSalvar(saida: CenarioSaida) {
    atualizarCenario(saida)
    setFormulario(null)
  }

  const excluirItem = useMutation({
    mutationFn: (item: ItemSaida) => excluirItemCenario(id, item.id),
    onSuccess: (saida) => {
      atualizarCenario(saida)
      setParaExcluir(null)
    },
    // Erro na exclusão: fecha a confirmação e a mensagem aparece no topo da tela.
    onError: () => setParaExcluir(null),
  })

  return (
    <div className="mx-auto flex w-full max-w-240 flex-col gap-4 p-4 md:p-6">
      <CabecalhoTela titulo={cenario?.nome ?? 'Cenário'} voltarPara="/planejamento/cenarios" />

      {naoEncontrado && (
        <p role="alert" className="text-14 text-saida-texto">
          Cenário não encontrado.
        </p>
      )}
      {!naoEncontrado && consulta.isError && (
        <p role="alert" className="text-14 text-saida-texto">
          {mensagemErro(consulta.error)}
        </p>
      )}
      {excluirItem.isError && (
        <p role="alert" className="text-14 text-saida-texto">
          {mensagemErro(excluirItem.error)}
        </p>
      )}
      {!cenario && !consulta.isError && idValido && <p className="text-muted-foreground">Carregando…</p>}

      {cenario && (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
          <Card className="flex min-w-0 flex-col gap-3">
            <TituloBloco
              titulo="Itens"
              acaoRotulo="Adicionar item"
              onAcao={() => setFormulario({ tipo: 'criar' })}
            />
            <GrupoItens
              tipo="renda"
              itens={cenario.itens.filter((item) => item.tipo === 'renda')}
              aoEditar={(item) => setFormulario({ tipo: 'editar', item })}
              aoExcluir={setParaExcluir}
            />
            <GrupoItens
              tipo="despesa"
              itens={cenario.itens.filter((item) => item.tipo === 'despesa')}
              aoEditar={(item) => setFormulario({ tipo: 'editar', item })}
              aoExcluir={setParaExcluir}
            />
          </Card>

          <ResultadoCenario resultado={cenario.resultado} />
        </div>
      )}

      {cenario && formulario && (
        <FormItemCenario
          cenarioId={id}
          pessoas={cenario.resultado.pessoas}
          item={formulario.tipo === 'editar' ? formulario.item : undefined}
          aoSalvar={aoSalvar}
          aoFechar={() => setFormulario(null)}
        />
      )}

      {paraExcluir && (
        <DialogoConfirmacao
          titulo="Excluir item"
          texto={`O item "${paraExcluir.descricao}" será apagado.`}
          rotuloAcao="Excluir"
          destrutivo
          onConfirmar={() => excluirItem.mutate(paraExcluir)}
          onCancelar={() => setParaExcluir(null)}
        />
      )}
    </div>
  )
}
