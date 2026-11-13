import type { ReactNode } from 'react'
import type { PessoaResultado, ResultadoSaida } from '../../api/cenarios'
import { Dinheiro } from '../../componentes/Dinheiro'
import { formatarPercentual } from '../../formatacao/percentual'
import css from './cenario.module.css'

type ResultadoCenarioProps = {
  resultado: ResultadoSaida
}

type IndicadorProps = {
  rotulo: string
  children: ReactNode
}

function Indicador({ rotulo, children }: IndicadorProps) {
  return (
    <div className={css.indicador}>
      <dt className={css.rotulo}>{rotulo}</dt>
      <dd className={css.valor}>{children}</dd>
    </div>
  )
}

type PessoaProps = {
  pessoa: PessoaResultado
  semProporcao: boolean
}

// Sem proporção, porcentagem, aporte e sobra não aparecem (CA-7.12).
function Pessoa({ pessoa, semProporcao }: PessoaProps) {
  return (
    <li className={css.pessoa}>
      <h3 className={css.nomePessoa}>{pessoa.nome}</h3>
      <dl className={css.indicadores}>
        <Indicador rotulo="Renda">
          <Dinheiro valor={pessoa.renda} />
        </Indicador>
        <Indicador rotulo="Despesas próprias">
          <Dinheiro valor={pessoa.despesas_proprias} />
        </Indicador>
        {!semProporcao && (
          <>
            <Indicador rotulo="Porcentagem">
              {pessoa.porcentagem !== null ? formatarPercentual(pessoa.porcentagem) : '—'}
            </Indicador>
            <Indicador rotulo="Aporte">
              {pessoa.aporte !== null ? <Dinheiro valor={pessoa.aporte} /> : '—'}
            </Indicador>
            <Indicador rotulo="Sobra">
              {pessoa.sobra !== null ? <Dinheiro valor={pessoa.sobra} /> : '—'}
            </Indicador>
          </>
        )}
      </dl>
    </li>
  )
}

// Resultado do cenário: todos os valores vêm do servidor, nada é somado aqui (RNF-02).
export function ResultadoCenario({ resultado }: ResultadoCenarioProps) {
  const semProporcao = resultado.sem_proporcao

  return (
    <section className={css.secao}>
      <h2 className={css.subtitulo}>Resultado</h2>
      <dl className={css.indicadores}>
        <Indicador rotulo="Total de rendas">
          <Dinheiro valor={resultado.total_rendas} />
        </Indicador>
        <Indicador rotulo="Total de despesas">
          <Dinheiro valor={resultado.total_despesas} />
        </Indicador>
        <Indicador rotulo="Saldo mensal">
          <Dinheiro valor={resultado.saldo_mensal} />
        </Indicador>
      </dl>
      {semProporcao && <p className={css.aviso}>Por pessoa: sem proporção (não há renda no cenário).</p>}
      <ul className={css.pessoas}>
        {resultado.pessoas.map((pessoa) => (
          <Pessoa key={pessoa.usuario_id} pessoa={pessoa} semProporcao={semProporcao} />
        ))}
      </ul>
    </section>
  )
}
