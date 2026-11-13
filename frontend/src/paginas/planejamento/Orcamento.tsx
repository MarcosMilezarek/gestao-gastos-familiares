import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { copiarDoAnterior, excluirOrcamento, obterOrcamento } from '../../api/orcamentos'
import { CardsResumo } from '../../componentes/CardsResumo'
import { Dinheiro } from '../../componentes/Dinheiro'
import { DialogoConfirmacao } from '../../componentes/DialogoConfirmacao'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import estado from '../../componentes/estado.module.css'
import { SeletorMes } from '../../componentes/SeletorMes'
import { formatarPercentual } from '../../formatacao/percentual'
import { useMes } from '../../hooks/useMes'
import { AssistenteOrcamento } from './AssistenteOrcamento'
import { ComparacaoOrcamento } from './ComparacaoOrcamento'
import styles from './orcamento.module.css'

function mensagemErro(erro: unknown): string {
  return erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.'
}

export function Orcamento() {
  const queryClient = useQueryClient()
  const { mes, setMes } = useMes()
  const [assistente, setAssistente] = useState(false)
  const [confirmarCopia, setConfirmarCopia] = useState(false)
  const [confirmarExclusao, setConfirmarExclusao] = useState(false)

  // Com a sessão ainda não carregada, mes é "": não consulta a API com mês vazio.
  const consulta = useQuery({
    queryKey: ['orcamento', mes],
    queryFn: () => obterOrcamento(mes),
    enabled: mes !== '',
    retry: repetirSem4xx,
  })
  const dados = consulta.data
  const orcamento = dados?.orcamento ?? null

  // Destino já com orçamento: o servidor recusa; pede confirmação e repete com substituir: true.
  const copiar = useMutation({
    mutationFn: (substituir: boolean) => copiarDoAnterior(mes, substituir),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orcamento', mes] })
    },
    onError: (erro) => {
      if (erro instanceof ApiError && erro.codigo === 'ORCAMENTO_JA_EXISTE') {
        // O orçamento existe no servidor: a tela reconsulta para sair do estado vazio.
        queryClient.invalidateQueries({ queryKey: ['orcamento', mes] })
        setConfirmarCopia(true)
      }
    },
  })
  const erroCopia =
    copiar.error instanceof ApiError && copiar.error.codigo === 'ORCAMENTO_JA_EXISTE'
      ? null
      : copiar.error

  const excluir = useMutation({
    mutationFn: () => excluirOrcamento(mes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orcamento', mes] })
      setConfirmarExclusao(false)
    },
    // Erro na exclusão: fecha a confirmação e a mensagem aparece no topo da tela.
    onError: () => setConfirmarExclusao(false),
  })

  // Erros de copiar e de excluir valem para o mês em que ocorreram: somem ao trocar de mês ou reabrir o assistente.
  function trocarMes(novoMes: string) {
    copiar.reset()
    excluir.reset()
    setMes(novoMes)
  }

  function abrirAssistente() {
    copiar.reset()
    excluir.reset()
    setAssistente(true)
  }

  const botaoCopiar = (
    <button
      type="button"
      className={styles.copiar}
      disabled={copiar.isPending}
      onClick={() => copiar.mutate(false)}
    >
      Copiar do mês anterior
    </button>
  )

  return (
    <div className={styles.pagina}>
      <header className={styles.topo}>
        <h1 className={styles.titulo}>Orçamento</h1>
        <SeletorMes mes={mes} onMudar={trocarMes} />
      </header>

      {consulta.isError && (
        <p role="alert" className={styles.erro}>
          {mensagemErro(consulta.error)}
        </p>
      )}
      {erroCopia && (
        <p role="alert" className={styles.erro}>
          {mensagemErro(erroCopia)}
        </p>
      )}
      {excluir.isError && (
        <p role="alert" className={styles.erro}>
          {mensagemErro(excluir.error)}
        </p>
      )}
      {!dados && !consulta.isError && <p className={styles.aviso}>Carregando…</p>}

      {dados && orcamento === null && (
        <div className={styles.vazio}>
          <EstadoVazio
            frase="Este mês ainda não tem orçamento."
            acaoRotulo="Definir novo orçamento"
            onAcao={abrirAssistente}
          />
          {botaoCopiar}
        </div>
      )}

      {dados && orcamento !== null && (
        <>
          <CardsResumo>
            <div className={styles.card}>
              <span className={styles.rotulo}>Renda</span>
              <Dinheiro valor={orcamento.resumo.renda} tipo="entrada" />
            </div>
            <div className={styles.card}>
              <span className={styles.rotulo}>Gastos planejados</span>
              <Dinheiro valor={orcamento.resumo.gastos_planejados} tipo="saida" />
            </div>
            <div className={styles.card}>
              <span className={styles.rotulo}>Balanço planejado</span>
              <Dinheiro valor={orcamento.resumo.balanco_planejado} />
            </div>
            <div className={styles.card}>
              <span className={styles.rotulo}>Economia planejada</span>
              {orcamento.resumo.economia_planejada === null ? (
                <span>—</span>
              ) : (
                <span>{formatarPercentual(orcamento.resumo.economia_planejada)}</span>
              )}
            </div>
          </CardsResumo>

          <div className={styles.acoes}>
            <button type="button" className={estado.acao} onClick={abrirAssistente}>
              Editar
            </button>
            <button
              type="button"
              className={estado.acao}
              onClick={() => setConfirmarExclusao(true)}
            >
              Excluir
            </button>
            {botaoCopiar}
          </div>

          <ComparacaoOrcamento mes={mes} />
        </>
      )}

      {assistente && dados && (
        <AssistenteOrcamento
          mes={mes}
          orcamento={orcamento}
          rendaSugerida={dados.renda_sugerida}
          aoFechar={() => setAssistente(false)}
          aoSalvar={() => setAssistente(false)}
        />
      )}

      {confirmarCopia && (
        <DialogoConfirmacao
          titulo="Substituir orçamento"
          texto="Este mês já tem orçamento. Copiar do mês anterior vai substituí-lo."
          rotuloAcao="Substituir"
          onConfirmar={() => {
            setConfirmarCopia(false)
            copiar.mutate(true)
          }}
          onCancelar={() => setConfirmarCopia(false)}
        />
      )}

      {confirmarExclusao && (
        <DialogoConfirmacao
          titulo="Excluir orçamento"
          texto="O orçamento deste mês será apagado."
          rotuloAcao="Excluir"
          onConfirmar={() => excluir.mutate()}
          onCancelar={() => setConfirmarExclusao(false)}
        />
      )}
    </div>
  )
}
