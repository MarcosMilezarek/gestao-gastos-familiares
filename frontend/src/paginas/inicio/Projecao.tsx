import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { listarContas } from '../../api/contas'
import { obterProjecao, type HorizonteProjecao } from '../../api/projecao'
import { Campo } from '../../componentes/Campo'
import { Dinheiro } from '../../componentes/Dinheiro'
import { GraficoArea } from '../../componentes/GraficoArea'
import estado from '../../componentes/estado.module.css'
import { rotuloMes } from '../../formatacao/data'
import styles from './projecao.module.css'

const HORIZONTES: HorizonteProjecao[] = [3, 6, 12]

export function Projecao() {
  const [contaId, setContaId] = useState<number | undefined>(undefined)
  const [horizonte, setHorizonte] = useState<HorizonteProjecao>(6)

  // Mesma chave e função de Controle.tsx: o cache guarda o mesmo formato.
  const contas = useQuery({
    queryKey: ['contas'],
    queryFn: async () => (await listarContas()).contas,
    retry: repetirSem4xx,
  })

  const consulta = useQuery({
    queryKey: ['projecao', { conta_id: contaId, horizonte }],
    queryFn: () => obterProjecao({ horizonte, conta_id: contaId }),
    // Mantém os dados anteriores até a resposta nova chegar, sem sumir com gráfico e tabela.
    placeholderData: keepPreviousData,
    // Erro 4xx é determinístico: não repete.
    retry: repetirSem4xx,
  })
  const dados = consulta.data

  function escolherConta(valor: string) {
    setContaId(valor === '' ? undefined : Number(valor))
  }

  function escolherHorizonte(valor: string) {
    const escolhido = HORIZONTES.find((h) => String(h) === valor)
    if (escolhido !== undefined) setHorizonte(escolhido)
  }

  return (
    <div className={styles.pagina}>
      <Link to="/" className={estado.voltar}>
        Início
      </Link>
      <h1 className={styles.titulo}>Projeção de saldo</h1>

      <div className={styles.controles}>
        <Campo rotulo="Conta">
          <select
            className={styles.seletor}
            value={contaId === undefined ? '' : String(contaId)}
            onChange={(evento) => escolherConta(evento.target.value)}
          >
            <option value="">Todas</option>
            {contas.data?.map((conta) => (
              <option key={conta.id} value={conta.id}>
                {conta.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Horizonte">
          <select
            className={styles.seletor}
            value={String(horizonte)}
            onChange={(evento) => escolherHorizonte(evento.target.value)}
          >
            {HORIZONTES.map((h) => (
              <option key={h} value={h}>
                {h} meses
              </option>
            ))}
          </select>
        </Campo>
      </div>

      {consulta.isError && (
        <p role="alert" className={styles.erro}>
          {consulta.error instanceof ApiError
            ? consulta.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {!dados && !consulta.isError && <p className={styles.aviso}>Carregando…</p>}

      {dados && (
        <>
          <GraficoArea
            meses={dados.meses.map((mes) => ({ rotulo: rotuloMes(mes.mes), valor: mes.saldo_previsto }))}
          />

          <div className={styles.contorno}>
            <table className={styles.tabela}>
              <thead>
                <tr>
                  <th scope="col">Mês</th>
                  <th scope="col">Entradas</th>
                  <th scope="col">Saídas</th>
                  <th scope="col">Transferências de entrada</th>
                  <th scope="col">Transferências de saída</th>
                  <th scope="col">Pagamentos de fatura</th>
                  <th scope="col">Aplicações menos resgates</th>
                  <th scope="col">Saldo previsto</th>
                </tr>
              </thead>
              <tbody>
                {dados.meses.map((mes) => (
                  <tr key={mes.mes}>
                    <th scope="row">
                      {rotuloMes(mes.mes)}
                      {mes.previsto && <span className={styles.previsto}>Previsto</span>}
                    </th>
                    <td>
                      <Dinheiro valor={mes.entradas} tipo="entrada" />
                    </td>
                    <td>
                      <Dinheiro valor={mes.saidas} tipo="saida" />
                    </td>
                    <td>
                      <Dinheiro valor={mes.transferencias_entrada} tipo="entrada" />
                    </td>
                    <td>
                      <Dinheiro valor={mes.transferencias_saida} tipo="saida" />
                    </td>
                    <td>
                      <Dinheiro valor={mes.pagamentos_fatura} tipo="saida" />
                    </td>
                    <td>
                      <Dinheiro valor={mes.aplicacoes_menos_resgates} />
                    </td>
                    <td>
                      <Dinheiro valor={mes.saldo_previsto} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
