import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router'
import { listarCartoes } from '../../api/cartoes'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { CardCartao } from '../../componentes/CardCartao'
import { CardsResumo } from '../../componentes/CardsResumo'
import { Dinheiro } from '../../componentes/Dinheiro'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import cardConta from '../../componentes/cardConta.module.css'
import styles from './cartoes.module.css'

function mensagemErro(erro: unknown): string {
  return erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.'
}

export function Cartoes() {
  const navigate = useNavigate()
  const [arquivadasAbertas, setArquivadasAbertas] = useState(false)

  const consulta = useQuery({
    queryKey: ['cartoes', { arquivadas: false }],
    queryFn: () => listarCartoes({ arquivadas: false }),
    retry: repetirSem4xx,
  })
  const dados = consulta.data

  // Cartões de conta arquivada só são buscados ao abrir a seção.
  const consultaArquivadas = useQuery({
    queryKey: ['cartoes', { arquivadas: true }],
    queryFn: () => listarCartoes({ arquivadas: true }),
    enabled: arquivadasAbertas,
    retry: repetirSem4xx,
  })
  const arquivados = consultaArquivadas.data

  return (
    <div className={styles.pagina}>
      <h1 className={styles.titulo}>Cartões</h1>

      {consulta.isError && (
        <p role="alert" className={styles.erro}>
          {mensagemErro(consulta.error)}
        </p>
      )}
      {!dados && !consulta.isError && <p className={styles.aviso}>Carregando…</p>}

      {dados && (
        <>
          <CardsResumo>
            <div className={styles.total}>
              <span className={cardConta.rotulo}>Limite disponível</span>
              {dados.limite_disponivel_total !== null && (
                <Dinheiro valor={dados.limite_disponivel_total} />
              )}
            </div>
            <div className={styles.total}>
              <span className={cardConta.rotulo}>Faturas do mês</span>
              {dados.total_faturas_mes !== null && <Dinheiro valor={dados.total_faturas_mes} />}
            </div>
          </CardsResumo>

          {dados.cartoes.length === 0 ? (
            <EstadoVazio
              frase="Nenhum cartão cadastrado."
              acaoRotulo="Cadastrar cartão"
              onAcao={() => navigate('/cartoes/novo')}
            />
          ) : (
            <ul className={styles.lista}>
              {dados.cartoes.map((cartao) => (
                <li key={cartao.id}>
                  <CardCartao cartao={cartao} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <section>
        <button
          type="button"
          className={styles.colapsavel}
          aria-expanded={arquivadasAbertas}
          aria-controls="cartoes-arquivadas"
          onClick={() => setArquivadasAbertas((aberta) => !aberta)}
        >
          Contas arquivadas
          <ChevronDown
            aria-hidden="true"
            size={20}
            className={arquivadasAbertas ? styles.setaAberta : styles.seta}
          />
        </button>

        {arquivadasAbertas && (
          <div id="cartoes-arquivadas" className={styles.arquivadas}>
            {consultaArquivadas.isError && (
              <p role="alert" className={styles.erro}>
                {mensagemErro(consultaArquivadas.error)}
              </p>
            )}
            {!arquivados && !consultaArquivadas.isError && (
              <p className={styles.aviso}>Carregando…</p>
            )}
            {arquivados &&
              (arquivados.cartoes.length === 0 ? (
                <p className={styles.aviso}>Nenhum cartão em contas arquivadas.</p>
              ) : (
                <ul className={styles.lista}>
                  {arquivados.cartoes.map((cartao) => (
                    <li key={cartao.id}>
                      <CardCartao cartao={cartao} />
                    </li>
                  ))}
                </ul>
              ))}
          </div>
        )}
      </section>
    </div>
  )
}
