import type { ReactNode } from 'react'
import { History, Info } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import type { ProporcaoSaida } from '../api/proporcao'
import { eZero } from '../formatacao/dinheiro'
import { formatarPercentual } from '../formatacao/percentual'
import { rotuloMes } from '../formatacao/data'
import { Dinheiro } from './Dinheiro'

type PessoaProporcao = ProporcaoSaida['pessoas'][number]

type CardsProporcaoProps = {
  proporcao: ProporcaoSaida
  acaoPessoa?: (pessoa: PessoaProporcao) => ReactNode
}

const linha = 'flex items-baseline justify-between gap-2'

// Uma linha por pessoa (porcentagem, devido, aportado, faltante/excedente) e a origem da porcentagem.
// Usado na tela de proporção e no topo do Controle; quem chama decide o que mais vai na linha.
export function CardsProporcao({ proporcao, acaoPessoa }: CardsProporcaoProps) {
  return (
    <>
      <div className="flex flex-col gap-3">
        {proporcao.pessoas.map((pessoa, i) => {
          const tom = i === 0 ? 'primary' : 'entrada'
          return (
            <section
              key={pessoa.usuario_id}
              className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-card"
            >
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback tom={tom}>{pessoa.nome.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <h2 className="min-w-0 flex-1 truncate text-14 font-semibold">{pessoa.nome}</h2>
                <p className="text-14 font-bold tabular-nums">{formatarPercentual(pessoa.porcentagem)}</p>
              </div>
              <Progress value={Number(pessoa.porcentagem)} tom={tom} aria-label={`Porcentagem de ${pessoa.nome}`} />
              <dl className="m-0 flex flex-col gap-1 text-14 tabular-nums">
                <div className={linha}>
                  <dt className="text-muted-foreground">Devido</dt>
                  <dd className="m-0 font-bold">
                    <Dinheiro valor={pessoa.devido} />
                  </dd>
                </div>
                <div className={linha}>
                  <dt className="text-muted-foreground">Aportado</dt>
                  <dd className="m-0 font-bold">
                    <Dinheiro valor={pessoa.aportado} />
                  </dd>
                </div>
                {eZero(pessoa.excedente) ? (
                  <div className={linha}>
                    <dt className="text-muted-foreground">Faltante</dt>
                    <dd className="m-0 font-bold">
                      <Dinheiro valor={pessoa.faltante} />
                    </dd>
                  </div>
                ) : (
                  <div className={linha}>
                    <dt className="text-muted-foreground">Excedente</dt>
                    <dd className="m-0 font-bold">
                      <Dinheiro valor={pessoa.excedente} />
                    </dd>
                  </div>
                )}
              </dl>
              {acaoPessoa?.(pessoa)}
            </section>
          )
        })}
      </div>

      {proporcao.origem_porcentagem === 'herdada' && proporcao.mes_origem !== null && (
        <p className="m-0 flex items-center gap-2 text-14 text-muted-foreground">
          <History aria-hidden="true" size={16} />
          <span>Porcentagem herdada de {rotuloMes(proporcao.mes_origem)}</span>
        </p>
      )}
      {proporcao.origem_porcentagem === 'padrao_50_50' && (
        <p className="m-0 flex items-center gap-2 text-14 text-muted-foreground">
          <Info aria-hidden="true" size={16} />
          <span>50% para cada, por falta de Salário no histórico</span>
        </p>
      )}
    </>
  )
}
