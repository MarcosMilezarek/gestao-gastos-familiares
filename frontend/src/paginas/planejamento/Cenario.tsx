import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import {
  excluirItemCenario,
  obterCenario,
  type CenarioSaida,
  type ItemSaida,
} from '../../api/cenarios'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { Dinheiro } from '../../componentes/Dinheiro'
import { DialogoConfirmacao } from '../../componentes/DialogoConfirmacao'
import estado from '../../componentes/estado.module.css'
import formato from '../../componentes/formato.module.css'
import { FormItemCenario } from './FormItemCenario'
import { ResultadoCenario } from './ResultadoCenario'
import css from './cenario.module.css'

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
    <div className={css.grupo}>
      <h3 className={css.subtitulo}>{rotulo}</h3>
      {itens.length === 0 && (
        <p className={css.aviso}>Nenhum item de {tipo === 'renda' ? 'renda' : 'despesa'}.</p>
      )}
      <ul className={css.lista}>
        {itens.map((item) => (
          <li key={item.id} className={css.item}>
            <div className={css.textoItem}>
              <span className={css.descricao}>{item.descricao}</span>
              <span className={css.secundario}>{item.dono_nome}</span>
            </div>
            <Dinheiro valor={item.valor} tipo={sinal} />
            <div className={css.acoes}>
              <button
                type="button"
                className={estado.acao}
                aria-label={`Editar ${item.descricao}`}
                onClick={() => aoEditar(item)}
              >
                Editar
              </button>
              <button
                type="button"
                className={estado.acao}
                aria-label={`Excluir ${item.descricao}`}
                onClick={() => aoExcluir(item)}
              >
                Excluir
              </button>
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
    <div className={css.pagina}>
      <Link to="/planejamento/cenarios" className={estado.voltar}>
        Cenários
      </Link>

      {naoEncontrado && (
        <p role="alert" className={formato.erro}>
          Cenário não encontrado.
        </p>
      )}
      {!naoEncontrado && consulta.isError && (
        <p role="alert" className={formato.erro}>
          {mensagemErro(consulta.error)}
        </p>
      )}
      {excluirItem.isError && (
        <p role="alert" className={formato.erro}>
          {mensagemErro(excluirItem.error)}
        </p>
      )}
      {!cenario && !consulta.isError && idValido && <p className={css.aviso}>Carregando…</p>}

      {cenario && (
        <>
          <h1 className={css.titulo}>{cenario.nome}</h1>

          <section className={css.secao}>
            <div className={css.cabecalhoSecao}>
              <h2 className={css.subtitulo}>Itens</h2>
              <button
                type="button"
                className={estado.acao}
                onClick={() => setFormulario({ tipo: 'criar' })}
              >
                Adicionar item
              </button>
            </div>
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
          </section>

          <ResultadoCenario resultado={cenario.resultado} />
        </>
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
          onConfirmar={() => excluirItem.mutate(paraExcluir)}
          onCancelar={() => setParaExcluir(null)}
        />
      )}
    </div>
  )
}
