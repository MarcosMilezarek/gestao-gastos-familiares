import { CircleCheck, CircleDashed, CircleMinus, Lock, TriangleAlert, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { FaturaStatus } from '../../api/cartoes'
import type { BalancoConta, Par } from '../../api/controle'
import type { InicioSaida } from '../../api/inicio'
import type { CategoriaRelatorio } from '../../api/relatorios'
import { Dinheiro } from '../../componentes/Dinheiro'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import { GraficoArea } from '../../componentes/GraficoArea'
import { GraficoRosca } from '../../componentes/GraficoRosca'
import { TituloBloco } from '../../componentes/TituloBloco'
import { formatarData, rotuloMes } from '../../formatacao/data'

type BlocosAnaliseProps = { inicio: InicioSaida }

type TipoDinheiro = 'entrada' | 'saida' | 'neutro'

// Mesmo mapa de CardCartao: status da fatura com ícone e texto, além da cor (RNF-08).
const STATUS: Record<
  FaturaStatus,
  { rotulo: string; Icone: LucideIcon; variante: 'info' | 'outline' | 'destructive' | 'entrada' }
> = {
  aberta: { rotulo: 'Aberta', Icone: CircleDashed, variante: 'info' },
  fechada: { rotulo: 'Fechada', Icone: Lock, variante: 'outline' },
  vencida: { rotulo: 'Vencida', Icone: TriangleAlert, variante: 'destructive' },
  zerada: { rotulo: 'Zerada', Icone: CircleMinus, variante: 'outline' },
  paga: { rotulo: 'Paga', Icone: CircleCheck, variante: 'entrada' },
}

// Categoria sem id (ajuste de fatura) entra na rosca com a chave "ajuste".
function paraItemRosca(categoria: CategoriaRelatorio) {
  return {
    chave: categoria.categoria_id === null ? 'ajuste' : String(categoria.categoria_id),
    nome: categoria.nome,
    valor: categoria.valor,
    porcentagem: categoria.porcentagem,
    cor: categoria.cor,
  }
}

function LinhaPar({ rotulo, par, tipo = 'neutro' }: { rotulo: string; par: Par; tipo?: TipoDinheiro }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="m-0 text-14 font-semibold">{rotulo}</p>
      <dl className="m-0 grid grid-cols-2 gap-2 text-14">
        <div>
          <dt className="text-13 text-muted-foreground">Previsto</dt>
          <dd className="m-0">
            <Dinheiro valor={par.previsto} tipo={tipo} />
          </dd>
        </div>
        <div>
          <dt className="text-13 text-muted-foreground">Realizado</dt>
          <dd className="m-0">
            <Dinheiro valor={par.realizado} tipo={tipo} />
          </dd>
        </div>
      </dl>
    </div>
  )
}

// Blocos 4 a 7 do Início. Cada bloco sem dados mostra EstadoVazio e continua na tela (RF-5.21).
export function BlocosAnalise({ inicio }: BlocosAnaliseProps) {
  const { despesas_por_categoria, balanco_contas, proximas_faturas, projecao } = inicio

  return (
    <>
      <section className="flex flex-col gap-2">
        <TituloBloco titulo="Despesas por categoria" />
        {despesas_por_categoria.categorias.length === 0 ? (
          <EstadoVazio compacto frase="Nenhuma despesa no mês." />
        ) : (
          <Card>
            <GraficoRosca itens={despesas_por_categoria.categorias.map(paraItemRosca)} />
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <TituloBloco titulo="Balanço do mês por conta" />
        {balanco_contas.length === 0 ? (
          <EstadoVazio compacto frase="Nenhuma conta ativa ainda." />
        ) : (
          balanco_contas.map((conta: BalancoConta) => (
            <Card key={conta.conta_id}>
                <h3 className="m-0 text-16 font-semibold">{conta.nome}</h3>
                <LinhaPar rotulo="Entradas" par={conta.entradas} tipo="entrada" />
                <Separator />
                <LinhaPar rotulo="Saídas" par={conta.saidas} tipo="saida" />
                <Separator />
                <LinhaPar rotulo="Saldo do mês" par={conta.saldo} />
            </Card>
          ))
        )}
      </section>

      <section className="flex flex-col gap-2">
        <TituloBloco titulo="Próximas faturas" />
        {proximas_faturas.length === 0 ? (
          <EstadoVazio compacto frase="Nenhuma fatura em aberto." />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {proximas_faturas.map((fatura) => {
              const { rotulo, Icone, variante } = STATUS[fatura.status]
              return (
                <li key={fatura.cartao_id}>
                  <Link
                    to={`/cartoes/${fatura.cartao_id}/faturas/${fatura.mes}`}
                    className="block min-h-11 rounded-xl outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <Card className="gap-2 p-4">
                      <span className="flex items-center justify-between gap-2 text-16 font-semibold">
                        <span className="min-w-0 truncate">{fatura.cartao_nome}</span>
                        <Dinheiro valor={fatura.valor} />
                      </span>
                      <span className="flex items-center justify-between gap-2 text-13 text-muted-foreground">
                        <span>
                          Vencimento{' '}
                          <time dateTime={fatura.vencimento} className="tabular-nums">
                            {formatarData(fatura.vencimento)}
                          </time>
                        </span>
                        <Badge variant={variante}>
                          <Icone aria-hidden="true" />
                          {rotulo}
                        </Badge>
                      </span>
                    </Card>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <TituloBloco titulo="Projeção de saldo" acaoRotulo="Ver projeção" acaoPara="/projecao" />
        {projecao.meses.length === 0 ? (
          <EstadoVazio compacto frase="Sem projeção para mostrar." />
        ) : (
          <Card>
            <GraficoArea
              meses={projecao.meses.map((mes) => ({ rotulo: rotuloMes(mes.mes), valor: mes.saldo_previsto }))}
            />
            <ul className="m-0 flex list-none flex-col p-0">
              {projecao.meses.map((mes) => (
                <li
                  key={mes.mes}
                  className="flex min-h-11 items-center justify-between gap-2 border-b text-14 last:border-0"
                >
                  <span>{rotuloMes(mes.mes)}</span>
                  <Dinheiro valor={mes.saldo_previsto} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </>
  )
}
