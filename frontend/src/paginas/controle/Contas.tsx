import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { ApiError } from '../../api/cliente'
import { listarContas, type ContaSaida } from '../../api/contas'
import { CardConta } from '../../componentes/CardConta'
import { CardsResumo } from '../../componentes/CardsResumo'
import { Dinheiro } from '../../componentes/Dinheiro'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import cardConta from '../../componentes/cardConta.module.css'
import estado from '../../componentes/estado.module.css'
import { SeletorMes } from '../../componentes/SeletorMes'
import { useMes } from '../../hooks/useMes'
import { FormConta } from './FormConta'
import styles from './contas.module.css'

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
    <div className={styles.pagina}>
      <h1 className={styles.titulo}>Contas</h1>
      <SeletorMes mes={mes} onMudar={setMes} />

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
          <CardsResumo>
            <div className={styles.total}>
              <span className={cardConta.rotulo}>Saldo atual total</span>
              {dados.total_saldo_atual !== null && <Dinheiro valor={dados.total_saldo_atual} />}
            </div>
            <div className={styles.total}>
              <span className={cardConta.rotulo}>Saldo previsto total</span>
              {dados.total_saldo_previsto !== null && (
                <Dinheiro valor={dados.total_saldo_previsto} />
              )}
            </div>
          </CardsResumo>

          {dados.contas.length === 0 ? (
            <EstadoVazio frase="Nenhuma conta ativa neste momento." />
          ) : (
            <ul className={cardConta.lista}>
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

          <Link to="/controle/contas/arquivadas" className={estado.voltar}>
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
