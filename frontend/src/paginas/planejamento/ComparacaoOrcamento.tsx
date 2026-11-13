import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { obterComparacao, type ComparacaoLinha } from '../../api/orcamentos'
import { Dinheiro } from '../../componentes/Dinheiro'
import { iconeDe } from '../../componentes/icones'
import { formatarPercentual } from '../../formatacao/percentual'
import styles from './orcamento.module.css'

function mensagemErro(erro: unknown): string {
  return erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.'
}

// Medidas de uma linha (ou do total, com o planejado como limite).
type Valores = {
  limite: string | null
  gasto: string
  restante: string | null
  consumo: string | null
  acima_do_limite: boolean
}

// Barra pela string da API, como CardMeta: nunca passa por number. Consumo nulo: sem barra.
function Medidas({ valores }: { valores: Valores }) {
  const { limite, gasto, restante, consumo, acima_do_limite } = valores
  return (
    <>
      <dl className={styles.dados}>
        <div>
          <dt>Limite</dt>
          <dd>{limite === null ? 'Sem limite' : <Dinheiro valor={limite} />}</dd>
        </div>
        <div>
          <dt>Gasto</dt>
          <dd>
            <Dinheiro valor={gasto} />
          </dd>
        </div>
        <div>
          <dt>Restante</dt>
          <dd>{restante === null ? '—' : <Dinheiro valor={restante} />}</dd>
        </div>
        <div>
          <dt>Consumo</dt>
          <dd>{consumo === null ? '—' : formatarPercentual(consumo)}</dd>
        </div>
      </dl>
      {consumo !== null && (
        <div className={styles.barra} aria-hidden="true">
          <div
            className={acima_do_limite ? `${styles.preenchimento} ${styles.acima}` : styles.preenchimento}
            style={{ width: `max(0%, min(${consumo}%, 100%))` }}
          />
        </div>
      )}
      {acima_do_limite && <p className={styles.textoAcima}>acima do limite</p>}
    </>
  )
}

// Ícone da categoria na cor dela; sem ícone na linha, nada (como iconeColorido em CardMeta).
function iconeDaLinha(linha: ComparacaoLinha): ReactNode {
  if (linha.icone === null) return null
  const Icone = iconeDe(linha.icone)
  return <Icone aria-hidden="true" size={20} color={linha.cor ?? undefined} />
}

// Nome com ícone da categoria (quando há) e aviso de arquivada: a situação não depende só da cor.
function Nome({ linha }: { linha: ComparacaoLinha }) {
  return (
    <p className={styles.nome}>
      {iconeDaLinha(linha)}
      {linha.nome}
      {linha.arquivada && <span className={styles.arquivada}>(arquivada)</span>}
    </p>
  )
}

// Comparação só existe com orçamento no mês; 404 não é erro na tela (quem chama só a monta com orçamento).
export function ComparacaoOrcamento({ mes }: { mes: string }) {
  const consulta = useQuery({
    queryKey: ['orcamento', mes, 'comparacao'],
    queryFn: () => obterComparacao(mes),
    retry: repetirSem4xx,
  })
  if (consulta.error instanceof ApiError && consulta.error.status === 404) return null

  const dados = consulta.data
  return (
    <section className={styles.comparacao}>
      <h2 className={styles.subtitulo}>Planejado e gasto</h2>

      {consulta.isError && (
        <p role="alert" className={styles.erro}>
          {mensagemErro(consulta.error)}
        </p>
      )}
      {!dados && !consulta.isError && <p className={styles.aviso}>Carregando…</p>}

      {dados && (
        <>
          <ul className={styles.lista}>
            {dados.linhas.map((linha) => (
              <li key={linha.categoria_id ?? linha.nome} className={styles.item}>
                <Nome linha={linha} />
                <Medidas valores={linha} />
                {linha.subcategorias.length > 0 && (
                  <ul className={styles.sublista}>
                    {linha.subcategorias.map((sub) => (
                      <li key={sub.categoria_id ?? sub.nome} className={styles.subitem}>
                        <Nome linha={sub} />
                        <Medidas valores={sub} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>

          <div className={styles.total}>
            <p className={styles.nome}>Total</p>
            <Medidas
              valores={{
                limite: dados.total.planejado,
                gasto: dados.total.gasto,
                restante: dados.total.restante,
                consumo: dados.total.consumo,
                acima_do_limite: dados.total.acima_do_limite,
              }}
            />
          </div>
        </>
      )}
    </section>
  )
}
