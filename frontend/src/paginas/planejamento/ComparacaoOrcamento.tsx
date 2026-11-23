import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { obterComparacao, type ComparacaoLinha } from '../../api/orcamentos'
import { Dinheiro } from '../../componentes/Dinheiro'
import { iconeDe } from '../../componentes/icones'
import { TituloBloco } from '../../componentes/TituloBloco'
import { formatarPercentual } from '../../formatacao/percentual'

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

// Barra pela porcentagem que a API devolve (só limitada a 0 a 100 para o desenho). Consumo nulo: sem barra.
function Medidas({ valores }: { valores: Valores }) {
  const { limite, gasto, restante, consumo, acima_do_limite } = valores
  return (
    <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-14 tabular-nums">
        <div>
          <dt className="text-13 text-muted-foreground">Limite</dt>
          <dd>{limite === null ? 'Sem limite' : <Dinheiro valor={limite} />}</dd>
        </div>
        <div>
          <dt className="text-13 text-muted-foreground">Gasto</dt>
          <dd>
            <Dinheiro valor={gasto} />
          </dd>
        </div>
        <div>
          <dt className="text-13 text-muted-foreground">Restante</dt>
          <dd>{restante === null ? '—' : <Dinheiro valor={restante} />}</dd>
        </div>
        <div>
          <dt className="text-13 text-muted-foreground">Consumo</dt>
          <dd>{consumo === null ? '—' : formatarPercentual(consumo)}</dd>
        </div>
      </dl>
      {consumo !== null && (
        <Progress
          aria-hidden="true"
          tom={acima_do_limite ? 'saida' : 'primary'}
          value={Math.max(0, Math.min(Number(consumo), 100))}
        />
      )}
      {acima_do_limite && (
        <p className="flex items-center gap-1 text-14 font-semibold text-alerta-texto">
          <TriangleAlert aria-hidden="true" className="size-4" />
          acima do limite
        </p>
      )}
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
    <p className="flex items-center gap-2 text-16 font-semibold">
      {iconeDaLinha(linha)}
      {linha.nome}
      {linha.arquivada && <span className="text-14 font-normal text-muted-foreground">(arquivada)</span>}
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
    <section className="flex flex-col gap-3">
      <TituloBloco titulo="Planejado e gasto" />

      {consulta.isError && (
        <p role="alert" className="text-14 text-saida-texto">
          {mensagemErro(consulta.error)}
        </p>
      )}
      {!dados && !consulta.isError && <p className="text-14 text-muted-foreground">Carregando…</p>}

      {dados && (
        <>
          <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
            {dados.linhas.map((linha) => (
              <li key={linha.categoria_id ?? linha.nome} className="min-w-0">
                <Card className="gap-3 p-4">
                  <Nome linha={linha} />
                  <Medidas valores={linha} />
                  {linha.subcategorias.length > 0 && (
                    <ul className="flex flex-col gap-3 border-t pt-3">
                      {linha.subcategorias.map((sub) => (
                        <li key={sub.categoria_id ?? sub.nome} className="flex flex-col gap-2">
                          <Nome linha={sub} />
                          <Medidas valores={sub} />
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </li>
            ))}
          </ul>

          <Card className="gap-3 p-4">
            <p className="text-16 font-semibold">Total</p>
            <Medidas
              valores={{
                limite: dados.total.planejado,
                gasto: dados.total.gasto,
                restante: dados.total.restante,
                consumo: dados.total.consumo,
                acima_do_limite: dados.total.acima_do_limite,
              }}
            />
          </Card>
        </>
      )}
    </section>
  )
}
