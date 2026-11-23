import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { listarContas } from '../../api/contas'
import { obterProjecao, type HorizonteProjecao } from '../../api/projecao'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { Campo } from '../../componentes/Campo'
import { Dinheiro } from '../../componentes/Dinheiro'
import { GraficoArea } from '../../componentes/GraficoArea'
import { rotuloMes } from '../../formatacao/data'

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
    <div className="mx-auto flex w-full max-w-240 flex-col gap-4 p-4 md:p-6">
      <CabecalhoTela titulo="Projeção de saldo" voltarPara="/" />

      <div className="flex flex-col gap-3">
        <Campo rotulo="Conta">
          <Select
            value={contaId === undefined ? '' : String(contaId)}
            onChange={(evento) => escolherConta(evento.target.value)}
          >
            <option value="">Todas</option>
            {contas.data?.map((conta) => (
              <option key={conta.id} value={conta.id}>
                {conta.nome}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo rotulo="Horizonte">
          <Select value={String(horizonte)} onChange={(evento) => escolherHorizonte(evento.target.value)}>
            {HORIZONTES.map((h) => (
              <option key={h} value={h}>
                {h} meses
              </option>
            ))}
          </Select>
        </Campo>
      </div>

      {consulta.isError && (
        <p role="alert" className="text-14 text-saida-texto">
          {consulta.error instanceof ApiError
            ? consulta.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {!dados && !consulta.isError && <p className="text-14 text-muted-foreground">Carregando…</p>}

      {dados && (
        <>
          <Card className="lg:[&_[data-slot=chart]]:h-72">
            <GraficoArea
              meses={dados.meses.map((mes) => ({ rotulo: rotuloMes(mes.mes), valor: mes.saldo_previsto }))}
            />
          </Card>

          <Card className="gap-0 p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Mês</TableHead>
                  <TableHead scope="col">Entradas</TableHead>
                  <TableHead scope="col">Saídas</TableHead>
                  <TableHead scope="col">Transferências de entrada</TableHead>
                  <TableHead scope="col">Transferências de saída</TableHead>
                  <TableHead scope="col">Pagamentos de fatura</TableHead>
                  <TableHead scope="col">Aplicações menos resgates</TableHead>
                  <TableHead scope="col">Saldo previsto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dados.meses.map((mes) => (
                  <TableRow key={mes.mes}>
                    <TableHead scope="row" className="text-foreground">
                      <span className="flex items-center gap-2">
                        {rotuloMes(mes.mes)}
                        {mes.previsto && <Badge variant="secondary">Previsto</Badge>}
                      </span>
                    </TableHead>
                    <TableCell>
                      <Dinheiro valor={mes.entradas} tipo="entrada" />
                    </TableCell>
                    <TableCell>
                      <Dinheiro valor={mes.saidas} tipo="saida" />
                    </TableCell>
                    <TableCell>
                      <Dinheiro valor={mes.transferencias_entrada} tipo="entrada" />
                    </TableCell>
                    <TableCell>
                      <Dinheiro valor={mes.transferencias_saida} tipo="saida" />
                    </TableCell>
                    <TableCell>
                      <Dinheiro valor={mes.pagamentos_fatura} tipo="saida" />
                    </TableCell>
                    <TableCell>
                      <Dinheiro valor={mes.aplicacoes_menos_resgates} />
                    </TableCell>
                    <TableCell>
                      <Dinheiro valor={mes.saldo_previsto} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  )
}
