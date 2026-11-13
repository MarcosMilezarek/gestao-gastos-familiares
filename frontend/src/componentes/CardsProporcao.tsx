import type { ReactNode } from 'react'
import { History, Info } from 'lucide-react'
import type { ProporcaoSaida } from '../api/proporcao'
import { eZero } from '../formatacao/dinheiro'
import { formatarPercentual } from '../formatacao/percentual'
import { rotuloMes } from '../formatacao/data'
import { CardsResumo } from './CardsResumo'
import { Dinheiro } from './Dinheiro'
import styles from './cardsProporcao.module.css'

type PessoaProporcao = ProporcaoSaida['pessoas'][number]

type CardsProporcaoProps = {
  proporcao: ProporcaoSaida
  acaoPessoa?: (pessoa: PessoaProporcao) => ReactNode
}

// Um card por pessoa (porcentagem, devido, aportado, faltante/excedente) e a origem da porcentagem.
// Usado na tela de proporção e no topo do Controle; quem chama decide o que mais vai na linha.
export function CardsProporcao({ proporcao, acaoPessoa }: CardsProporcaoProps) {
  return (
    <>
      <CardsResumo>
        {proporcao.pessoas.map((pessoa) => (
          <section key={pessoa.usuario_id} className={styles.card}>
            <h2 className={styles.nome}>{pessoa.nome}</h2>
            <p className={styles.porcentagem}>{formatarPercentual(pessoa.porcentagem)}</p>
            <dl className={styles.valores}>
              <div>
                <dt>Devido</dt>
                <dd>
                  <Dinheiro valor={pessoa.devido} />
                </dd>
              </div>
              <div>
                <dt>Aportado</dt>
                <dd>
                  <Dinheiro valor={pessoa.aportado} />
                </dd>
              </div>
              {eZero(pessoa.excedente) ? (
                <div>
                  <dt>Faltante</dt>
                  <dd>
                    <Dinheiro valor={pessoa.faltante} />
                  </dd>
                </div>
              ) : (
                <div>
                  <dt>Excedente</dt>
                  <dd>
                    <Dinheiro valor={pessoa.excedente} />
                  </dd>
                </div>
              )}
            </dl>
            {acaoPessoa?.(pessoa)}
          </section>
        ))}
      </CardsResumo>

      {proporcao.origem_porcentagem === 'herdada' && proporcao.mes_origem !== null && (
        <p className={styles.origem}>
          <History aria-hidden="true" size={16} />
          <span>Porcentagem herdada de {rotuloMes(proporcao.mes_origem)}</span>
        </p>
      )}
      {proporcao.origem_porcentagem === 'padrao_50_50' && (
        <p className={styles.origem}>
          <Info aria-hidden="true" size={16} />
          <span>50% para cada, por falta de Salário no histórico</span>
        </p>
      )}
    </>
  )
}
