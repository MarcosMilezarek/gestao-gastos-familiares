import type { ReactNode } from 'react'
import type { PessoaResultado, ResultadoSaida } from '../../api/cenarios'
import { Card } from '@/components/ui/card'
import { CartaoDestaque } from '../../componentes/CartaoDestaque'
import { Dinheiro } from '../../componentes/Dinheiro'
import { TituloBloco } from '../../componentes/TituloBloco'
import { formatarPercentual } from '../../formatacao/percentual'

type ResultadoCenarioProps = {
  resultado: ResultadoSaida
}

type IndicadorProps = {
  rotulo: string
  children: ReactNode
}

function Indicador({ rotulo, children }: IndicadorProps) {
  return (
    <div className="flex items-center justify-between gap-3 text-14">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="m-0 tabular-nums">{children}</dd>
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
    <li>
      <Card className="flex flex-col gap-2 p-4">
        <h3 className="text-16 font-semibold">{pessoa.nome}</h3>
        <dl className="m-0 flex flex-col gap-2">
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
      </Card>
    </li>
  )
}

// Resultado do cenário: todos os valores vêm do servidor, nada é somado aqui (RNF-02).
export function ResultadoCenario({ resultado }: ResultadoCenarioProps) {
  const semProporcao = resultado.sem_proporcao

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <TituloBloco titulo="Resultado" />
      <CartaoDestaque
        rotulo="Saldo mensal"
        valor={resultado.saldo_mensal}
        chips={[
          { rotulo: 'Total de rendas', valor: resultado.total_rendas },
          { rotulo: 'Total de despesas', valor: resultado.total_despesas },
        ]}
      />
      {semProporcao && (
        <p className="text-14 text-muted-foreground">
          Por pessoa: sem proporção (não há renda no cenário).
        </p>
      )}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {resultado.pessoas.map((pessoa) => (
          <Pessoa key={pessoa.usuario_id} pessoa={pessoa} semProporcao={semProporcao} />
        ))}
      </ul>
    </section>
  )
}
