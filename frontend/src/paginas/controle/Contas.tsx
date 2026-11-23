import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { ApiError } from '../../api/cliente'
import { listarContas, type ContaSaida } from '../../api/contas'
import { CardConta } from '../../componentes/CardConta'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { CardResumo, CardsResumo } from '../../componentes/CardsResumo'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import { SeletorMes } from '../../componentes/SeletorMes'
import { useMes } from '../../hooks/useMes'
import { FormConta } from './FormConta'

export function Contas() {
  const navigate = useNavigate()
  const { mes, setMes } = useMes()
  const [contaEditando, setContaEditando] = useState<ContaSaida | null>(null)

  const consulta = useQuery({
    queryKey: ['contas', mes],
    queryFn: () => listarContas({ mes }),
    enabled: mes !== '',
  })
  const dados = consulta.data

  // Editar, reajustar e arquivar abrem o mesmo FormConta (que tem as três ações).
  const abrirFormConta = (conta: ContaSaida) => () => setContaEditando(conta)

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <CabecalhoTela titulo="Contas" voltarPara="/controle" />
      <SeletorMes mes={mes} onMudar={setMes} />

      {consulta.isError && (
        <p role="alert" className="text-saida-texto">
          {consulta.error instanceof ApiError
            ? consulta.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {!dados && !consulta.isError && <p className="text-muted-foreground">Carregando…</p>}

      {dados && (
        <>
          <CardsResumo>
            {dados.total_saldo_atual !== null && (
              <CardResumo rotulo="Saldo atual total" valor={dados.total_saldo_atual} />
            )}
            {dados.total_saldo_previsto !== null && (
              <CardResumo rotulo="Saldo previsto total" valor={dados.total_saldo_previsto} />
            )}
          </CardsResumo>

          {dados.contas.length === 0 ? (
            <EstadoVazio frase="Nenhuma conta ativa neste momento." />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3">
              {dados.contas.map((conta) => (
                <li key={conta.id}>
                  <CardConta
                    nome={conta.nome}
                    instituicao={conta.instituicao}
                    saldoAtual={conta.saldo_atual}
                    saldoPrevisto={conta.saldo_previsto}
                    onVerLancamentos={() => navigate(`/controle/contas/${conta.id}`)}
                    onEditar={abrirFormConta(conta)}
                    onReajustar={abrirFormConta(conta)}
                    onArquivar={abrirFormConta(conta)}
                  />
                </li>
              ))}
            </ul>
          )}

          <Link
            to="/controle/contas/arquivadas"
            className="inline-flex h-11 items-center self-start text-14 font-semibold text-primary-texto underline underline-offset-4"
          >
            Contas arquivadas
          </Link>

          {contaEditando && (
            <FormConta
              key={contaEditando.id}
              conta={contaEditando}
              aoFechar={() => setContaEditando(null)}
            />
          )}
        </>
      )}
    </div>
  )
}
