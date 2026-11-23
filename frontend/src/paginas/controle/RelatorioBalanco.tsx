import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { obterRelatorioBalancoMensal } from '../../api/relatorios'
import type { MesBalancoRelatorio } from '../../api/relatorios'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { Dinheiro } from '../../componentes/Dinheiro'
import { GraficoBarras } from '../../componentes/GraficoBarras'
import { SeletorMes } from '../../componentes/SeletorMes'
import { TituloBloco } from '../../componentes/TituloBloco'
import { rotuloMes } from '../../formatacao/data'
import { useMes } from '../../hooks/useMes'

type TipoDinheiro = 'entrada' | 'saida' | 'neutro'
type Par = MesBalancoRelatorio['entradas']

function BlocoPar({ rotulo, par, tipo = 'neutro' }: { rotulo: string; par: Par; tipo?: TipoDinheiro }) {
  return (
    <div className="flex flex-col gap-1 border-t pt-3 first:border-t-0 first:pt-0">
      <p className="text-14 font-semibold">{rotulo}</p>
      <dl className="grid grid-cols-2 gap-2 text-14">
        <div>
          <dt className="text-13 text-muted-foreground">Previsto</dt>
          <dd>
            <Dinheiro valor={par.previsto} tipo={tipo} />
          </dd>
        </div>
        <div>
          <dt className="text-13 text-muted-foreground">Realizado</dt>
          <dd>
            <Dinheiro valor={par.realizado} tipo={tipo} />
          </dd>
        </div>
      </dl>
    </div>
  )
}

// "AAAA-MM" -> "MM/AA": o eixo do gráfico é estreito no celular.
function rotuloCurto(mes: string): string {
  return `${mes.slice(5)}/${mes.slice(2, 4)}`
}

export function RelatorioBalanco() {
  const { mes, setMes } = useMes()

  const consulta = useQuery({
    queryKey: ['relatorio-balanco', mes],
    queryFn: () => obterRelatorioBalancoMensal(mes),
    enabled: mes !== '',
    // Erro 4xx é determinístico: não repete.
    retry: repetirSem4xx,
  })
  const dados = consulta.data

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 lg:mx-auto lg:w-full lg:max-w-240">
      <SeletorMes mes={mes} onMudar={setMes} />
      <CabecalhoTela titulo="Balanço mensal" voltarPara={`/controle/relatorios?mes=${mes}`} />

      {consulta.isError && (
        <p role="alert" className="text-14 text-saida-texto">
          {consulta.error instanceof ApiError
            ? consulta.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {!dados && !consulta.isError && <p className="text-14 text-muted-foreground">Carregando…</p>}

      {dados && (
        <>
          <Card className="lg:[&_[data-slot=chart]]:h-72">
            <TituloBloco titulo="Entradas × saídas (previsto)" />
            <GraficoBarras
              meses={dados.meses.map((item) => ({
                rotulo: rotuloCurto(item.mes),
                entradas: item.entradas.previsto,
                saidas: item.saidas.previsto,
              }))}
            />
          </Card>

          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
            {dados.meses.map((item) => (
              <Card key={item.mes} className="min-w-0">
                <TituloBloco titulo={rotuloMes(item.mes)} />
                <BlocoPar rotulo="Entradas" par={item.entradas} tipo="entrada" />
                <BlocoPar rotulo="Saídas" par={item.saidas} tipo="saida" />
                <BlocoPar rotulo="Saldo do mês" par={item.saldo} />
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
