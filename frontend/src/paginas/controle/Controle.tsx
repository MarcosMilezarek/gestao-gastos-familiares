import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { listarCartoes } from '../../api/cartoes'
import { listarCategorias } from '../../api/categorias'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { listarContas } from '../../api/contas'
import { type FiltrosControle, type ListaControle, type Par, obterLista } from '../../api/controle'
import { excluirLancamento, type LancamentoSaida } from '../../api/lancamentos'
import { obterProporcao } from '../../api/proporcao'
import { CardsProporcao } from '../../componentes/CardsProporcao'
import { CardResumo, CardsResumo } from '../../componentes/CardsResumo'
import type { Alcance } from '../../componentes/DialogoAlcance'
import { DialogoConfirmacao } from '../../componentes/DialogoConfirmacao'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import { FiltrosLista } from '../../componentes/FiltrosLista'
import type { LancamentoItem } from '../../componentes/ItemLancamento'
import { ListaLancamentos } from '../../componentes/ListaLancamentos'
import { MenuCadastros } from '../../componentes/MenuCadastros'
import { SeletorMes } from '../../componentes/SeletorMes'
import { VisoesControle } from '../../componentes/VisoesControle'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { formatarBRL } from '../../formatacao/dinheiro'
import { ConfirmarLancamento } from '../../formularios/ConfirmarLancamento'
import { DetalheLancamento } from '../../formularios/DetalheLancamento'
import { useFormularios } from '../../formularios/FormulariosProvider'
import { useFiltros } from '../../hooks/useFiltros'
import { useMes } from '../../hooks/useMes'
import { useSessao } from '../../hooks/useSessao'

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
        <p role="alert" className="m-0 text-saida-texto">
          {erroConsulta}
        </p>
      )}
      {!lista && !consulta.isError && <p className="m-0 text-muted-foreground">Carregando…</p>}

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
        <p role="alert" className="m-0 text-saida-texto">
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
          destrutivo
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
  const [menuAberto, setMenuAberto] = useState(false)

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
    <div className="flex flex-col gap-4 px-4 pb-4">
      <div className="sticky top-0 z-10 flex flex-col gap-2 bg-background pb-2">
        <SeletorMes mes={mes} onMudar={setMes} />
        <CabecalhoTela
          titulo="Controle"
          acao={
            <Button type="button" variant="ghost" size="sm" aria-haspopup="dialog" onClick={() => setMenuAberto(true)}>
              Cadastros
            </Button>
          }
        />
        <VisoesControle mes={mes} />
      </div>
      {menuAberto && <MenuCadastros aoFechar={() => setMenuAberto(false)} />}

      {lista && (
        <CardsResumo>
          <CardResumo rotulo="Saldo atual total" valor={lista.resumo.saldo_atual_total} />
          {cardsMes.map((card) => (
            <CardResumo
              key={card.rotulo}
              rotulo={card.rotulo}
              valor={card.par.realizado}
              apoio={`Previsto ${formatarBRL(card.par.previsto)}`}
              tom={card.tipo}
            />
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
