import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { listarCartoes } from '../../api/cartoes'
import { listarCategorias } from '../../api/categorias'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { listarContas } from '../../api/contas'
import { type FiltrosControle, type ListaControle, type Par, obterLista } from '../../api/controle'
import { excluirLancamento, type LancamentoSaida } from '../../api/lancamentos'
import { obterProporcao } from '../../api/proporcao'
import { CardsProporcao } from '../../componentes/CardsProporcao'
import { CardsResumo } from '../../componentes/CardsResumo'
import { Dinheiro } from '../../componentes/Dinheiro'
import type { Alcance } from '../../componentes/DialogoAlcance'
import { DialogoConfirmacao } from '../../componentes/DialogoConfirmacao'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import { FiltrosLista } from '../../componentes/FiltrosLista'
import type { LancamentoItem } from '../../componentes/ItemLancamento'
import { ListaLancamentos } from '../../componentes/ListaLancamentos'
import { SeletorMes } from '../../componentes/SeletorMes'
import { ConfirmarLancamento } from '../../formularios/ConfirmarLancamento'
import { DetalheLancamento } from '../../formularios/DetalheLancamento'
import { useFormularios } from '../../formularios/FormulariosProvider'
import { useFiltros } from '../../hooks/useFiltros'
import { useMes } from '../../hooks/useMes'
import { useSessao } from '../../hooks/useSessao'
import styles from './controle.module.css'

type Acao = { tipo: 'confirmar' | 'detalhe' | 'excluir'; id: number }

type ListaDoMesProps = {
  mes: string
  contaId?: number
  podeEscrever: boolean
  filtros?: FiltrosControle
  aoLimparFiltros?: () => void
}

function opcoesLista(mes: string, filtros: FiltrosControle) {
  return {
    queryKey: ['lancamentos', 'lista', mes, filtros],
    queryFn: () => obterLista(mes, filtros),
    enabled: mes !== '',
    retry: repetirSem4xx,
    // Trocar o filtro mantém a lista anterior até a resposta chegar (sem piscar).
    placeholderData: keepPreviousData,
  }
}

// Lançamento completo dentro da lista (as linhas de fatura não têm ações).
function acharLancamento(lista: ListaControle | undefined, id: number | undefined): LancamentoSaida | undefined {
  for (const dia of lista?.dias ?? []) {
    for (const linha of dia.itens) {
      if (linha.kind === 'lancamento' && linha.lancamento.id === id) return linha.lancamento
    }
  }
  return undefined
}

// Lista de lançamentos do mês; /controle/contas/:contaId usa a mesma com conta_id.
// Sem podeEscrever (conta arquivada, CA-2.05) não há ação de escrita nem "Novo lançamento".
export function ListaDoMes({ mes, contaId, podeEscrever, filtros = {}, aoLimparFiltros }: ListaDoMesProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { abrir } = useFormularios()
  const [acao, setAcao] = useState<Acao | null>(null)

  const filtrosLista = contaId === undefined ? filtros : { ...filtros, conta_id: [contaId] }
  const consulta = useQuery(opcoesLista(mes, filtrosLista))
  const lista = consulta.data
  // Formulários e detalhe precisam do lançamento completo; a lista guarda só o id.
  const alvo = acharLancamento(lista, acao?.id)

  const excluir = useMutation({
    mutationFn: ({ id, alcance }: { id: number; alcance?: Alcance }) => excluirLancamento(id, alcance),
    onSuccess: () => {
      queryClient.invalidateQueries()
    },
    onSettled: () => setAcao(null),
  })

  function fecharAcao() {
    setAcao(null)
  }

  function editar(item: LancamentoItem, alcance?: Alcance) {
    const lancamento = acharLancamento(lista, item.id)
    // Aplicação e resgate editam pela meta (D11); reajuste não tem formulário.
    if (
      !lancamento ||
      lancamento.tipo === 'aplicacao' ||
      lancamento.tipo === 'resgate' ||
      lancamento.tipo === 'reajuste'
    )
      return
    abrir(lancamento.tipo, lancamento, undefined, alcance)
  }

  // Com alcance, a escolha no DialogoAlcance já confirma a exclusão; sem ele, pede confirmação.
  function excluirItem(item: LancamentoItem, alcance?: Alcance) {
    if (alcance) excluir.mutate({ id: item.id, alcance })
    else setAcao({ tipo: 'excluir', id: item.id })
  }

  const erroConsulta =
    consulta.error instanceof ApiError ? consulta.error.mensagem : 'Erro inesperado. Tente novamente.'
  const erroExcluir =
    excluir.error instanceof ApiError ? excluir.error.mensagem : 'Erro inesperado. Tente novamente.'

  // RF-5.13: a lista filtrada vazia tem frase e "Limpar filtros"; /controle/contas/:contaId não passa aoLimparFiltros.
  const semResultadoFiltrado =
    lista?.filtros_ativos === true && lista.dias.length === 0 && aoLimparFiltros !== undefined

  return (
    <>
      {consulta.isError && (
        <p role="alert" className={styles.erro}>
          {erroConsulta}
        </p>
      )}
      {!lista && !consulta.isError && <p className={styles.aviso}>Carregando…</p>}

      {semResultadoFiltrado && (
        <EstadoVazio
          frase="Nenhum lançamento com esses filtros"
          acaoRotulo="Limpar filtros"
          onAcao={aoLimparFiltros}
        />
      )}

      {lista && !semResultadoFiltrado && (
        <ListaLancamentos
          dias={lista.dias}
          aoAbrir={(item) => setAcao({ tipo: 'detalhe', id: item.id })}
          aoAbrirFatura={(fatura) => navigate(`/cartoes/${fatura.cartao_id}/faturas/${fatura.mes}`)}
          aoConfirmar={podeEscrever ? (item) => setAcao({ tipo: 'confirmar', id: item.id }) : undefined}
          aoEditar={podeEscrever ? editar : undefined}
          aoExcluir={podeEscrever ? excluirItem : undefined}
          aoNovo={podeEscrever ? () => abrir('despesa') : undefined}
        />
      )}

      {excluir.isError && (
        <p role="alert" className={styles.erro}>
          {erroExcluir}
        </p>
      )}

      {alvo && acao?.tipo === 'confirmar' && (
        <ConfirmarLancamento key={alvo.id} lancamento={alvo} aoFechar={fecharAcao} />
      )}
      {alvo && acao?.tipo === 'detalhe' && (
        <DetalheLancamento lancamento={alvo} aoFechar={fecharAcao} />
      )}
      {alvo && acao?.tipo === 'excluir' && (
        <DialogoConfirmacao
          titulo="Excluir lançamento"
          texto="Excluir este lançamento?"
          rotuloAcao="Excluir"
          onConfirmar={() => excluir.mutate({ id: alvo.id })}
          onCancelar={fecharAcao}
        />
      )}
    </>
  )
}

export function Controle() {
  const { mes, setMes } = useMes()
  const controle = useFiltros()
  const sessao = useSessao().data

  // Mesma chave da lista de lançamentos: os cards não fazem segunda ida à rede.
  const lista = useQuery(opcoesLista(mes, controle.filtros)).data
  // Sem vínculo a consulta falha e proporcao.data fica vazio: os cards de pessoa não aparecem.
  const proporcao = useQuery({
    queryKey: ['proporcao', mes],
    queryFn: () => obterProporcao(mes),
    enabled: mes !== '',
    retry: repetirSem4xx,
  })

  const cardsMes: { rotulo: string; par: Par; tipo: 'entrada' | 'saida' | 'neutro' }[] = lista
    ? [
        { rotulo: 'Entradas', par: lista.resumo.entradas, tipo: 'entrada' },
        { rotulo: 'Saídas', par: lista.resumo.saidas, tipo: 'saida' },
        { rotulo: 'Saldo do mês', par: lista.resumo.saldo, tipo: 'neutro' },
      ]
    : []

  // Falha ao carregar uma opção só deixa essa lista vazia; a lista de lançamentos continua.
  const contas = useQuery({
    queryKey: ['contas'],
    queryFn: async () => (await listarContas()).contas,
    retry: repetirSem4xx,
  })
  const categorias = useQuery({
    queryKey: ['categorias'],
    queryFn: () => listarCategorias(),
    retry: repetirSem4xx,
  })
  // Mesma chave e função de FormCompraCartao: o cache guarda o mesmo formato (ListaCartoes).
  const cartoes = useQuery({
    queryKey: ['cartoes', 'ativos'],
    queryFn: () => listarCartoes(),
    retry: repetirSem4xx,
  })

  const donos = sessao
    ? [
        { valor: sessao.usuario.id, nome: sessao.usuario.nome },
        ...(sessao.casal
          ? [
              { valor: sessao.casal.parceiro.id, nome: sessao.casal.parceiro.nome },
              { valor: 'casal', nome: 'Casal' },
            ]
          : []),
      ]
    : []
  const opcoes = {
    donos,
    contas: (contas.data ?? []).map((c) => ({ valor: c.id, nome: c.nome })),
    categorias: (categorias.data ?? []).flatMap((c) => [
      { valor: c.id, nome: c.nome },
      ...c.subcategorias.map((s) => ({ valor: s.id, nome: `${c.nome} / ${s.nome}` })),
    ]),
    cartoes: (cartoes.data?.cartoes ?? []).map((c) => ({ valor: c.id, nome: c.nome })),
  }

  return (
    <div className={styles.pagina}>
      <SeletorMes mes={mes} onMudar={setMes} />
      <h1 className={styles.titulo}>Controle</h1>

      <nav className={styles.chips} aria-label="Atalhos do controle">
        <Link to="/controle/contas" className={styles.chip}>
          Contas
        </Link>
        <Link to="/controle/categorias" className={styles.chip}>
          Categorias
        </Link>
        <Link to="/controle/tags" className={styles.chip}>
          Tags
        </Link>
        <Link to={`/controle/proporcao?mes=${mes}`} className={styles.chip}>
          Proporção
        </Link>
        <Link to={`/controle/balanco?mes=${mes}`} className={styles.chip}>
          Balanço
        </Link>
        <Link to={`/controle/relatorios?mes=${mes}`} className={styles.chip}>
          Relatórios
        </Link>
        <Link to="/projecao" className={styles.chip}>
          Projeção
        </Link>
      </nav>

      {lista && (
        <CardsResumo>
          <section className={styles.card}>
            <h2 className={styles.nome}>Saldo atual total</h2>
            <Dinheiro valor={lista.resumo.saldo_atual_total} />
          </section>
          {cardsMes.map((card) => (
            <section key={card.rotulo} className={styles.card}>
              <h2 className={styles.nome}>{card.rotulo}</h2>
              <dl className={styles.valores}>
                <div>
                  <dt>Previsto</dt>
                  <dd>
                    <Dinheiro valor={card.par.previsto} tipo={card.tipo} />
                  </dd>
                </div>
                <div>
                  <dt>Realizado</dt>
                  <dd>
                    <Dinheiro valor={card.par.realizado} tipo={card.tipo} />
                  </dd>
                </div>
              </dl>
            </section>
          ))}
        </CardsResumo>
      )}
      {proporcao.data && <CardsProporcao proporcao={proporcao.data} />}

      <FiltrosLista controle={controle} opcoes={opcoes} />
      <ListaDoMes
        mes={mes}
        podeEscrever
        filtros={controle.filtros}
        aoLimparFiltros={controle.limpar}
      />
    </div>
  )
}
