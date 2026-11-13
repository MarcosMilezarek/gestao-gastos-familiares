import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { listarMetas, type MetaSaida } from '../../api/metas'
import { CardMeta } from '../../componentes/CardMeta'
import { CardsResumo } from '../../componentes/CardsResumo'
import { Dinheiro } from '../../componentes/Dinheiro'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import cardConta from '../../componentes/cardConta.module.css'
import { FormMeta } from './FormMeta'
import styles from './metas.module.css'

type Situacao = MetaSaida['situacao']

const SITUACOES: Situacao[] = ['em_andamento', 'concluida']

const ROTULO_ABA: Record<Situacao, string> = {
  em_andamento: 'Em andamento',
  concluida: 'Concluídas',
}

const FRASE_ABA_VAZIA: Record<Situacao, string> = {
  em_andamento: 'Nenhuma meta em andamento.',
  concluida: 'Nenhuma meta concluída ainda.',
}

function mensagemErro(erro: unknown): string {
  return erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.'
}

export function Metas() {
  const [situacao, setSituacao] = useState<Situacao>('em_andamento')
  const [formAberto, setFormAberto] = useState(false)

  const consulta = useQuery({
    queryKey: ['metas'],
    queryFn: listarMetas,
    retry: repetirSem4xx,
  })
  const dados = consulta.data

  return (
    <div className={styles.pagina}>
      <header className={styles.topo}>
        <h1 className={styles.titulo}>Metas</h1>
        <button type="button" className={styles.novaMeta} onClick={() => setFormAberto(true)}>
          Nova meta
        </button>
      </header>

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
              <span className={cardConta.rotulo}>Patrimônio total</span>
              <Dinheiro valor={dados.patrimonio_total} />
            </div>
          </CardsResumo>

          {dados.metas.length === 0 ? (
            <EstadoVazio
              frase="Nenhuma meta cadastrada. Crie uma meta para acompanhar um objetivo do casal."
              acaoRotulo="Criar meta"
              onAcao={() => setFormAberto(true)}
            />
          ) : (
            <>
              <div className={styles.abas}>
                {SITUACOES.map((opcao) => (
                  <button
                    key={opcao}
                    type="button"
                    aria-pressed={situacao === opcao}
                    className={situacao === opcao ? `${styles.aba} ${styles.abaAtiva}` : styles.aba}
                    onClick={() => setSituacao(opcao)}
                  >
                    {ROTULO_ABA[opcao]}
                  </button>
                ))}
              </div>

              {dados.metas.filter((meta) => meta.situacao === situacao).length === 0 ? (
                <p className={styles.aviso}>{FRASE_ABA_VAZIA[situacao]}</p>
              ) : (
                <ul className={styles.lista}>
                  {dados.metas
                    .filter((meta) => meta.situacao === situacao)
                    .map((meta) => (
                      <li key={meta.id}>
                        <CardMeta meta={meta} />
                      </li>
                    ))}
                </ul>
              )}
            </>
          )}
        </>
      )}

      {formAberto && <FormMeta aoFechar={() => setFormAberto(false)} />}
    </div>
  )
}
