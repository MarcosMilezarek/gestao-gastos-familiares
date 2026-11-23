import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
  type PontoGrafico,
} from '@/components/ui/chart'
import { formatarBRL } from '../formatacao/dinheiro'

type MesGrafico = { rotulo: string; entradas: string; saidas: string }

type GraficoBarrasProps = { meses: MesGrafico[] }

const config: ChartConfig = {
  entradas: { label: 'Entradas', color: 'var(--entrada)' },
  saidas: { label: 'Saídas', color: 'var(--saida)' },
}

// Entradas e saídas lado a lado; a legenda é texto, não só cor (RNF-08).
export function GraficoBarras({ meses }: GraficoBarrasProps) {
  // Number só para o recharts desenhar as barras; o texto exibido vem da string original.
  // O tooltip mostra o par do mês, porque ele é compartilhado entre as duas barras.
  const dados = meses.map((mes) => ({
    rotulo: mes.rotulo,
    entradas: Number(mes.entradas),
    saidas: Number(mes.saidas),
    valor: 0,
    texto: `Entradas ${formatarBRL(mes.entradas)} · Saídas ${formatarBRL(mes.saidas)}`,
  })) satisfies (PontoGrafico & { rotulo: string; entradas: number; saidas: number })[]

  return (
    <div className="flex flex-col gap-2">
      <ChartContainer config={config} className="aspect-auto h-56 w-full" role="img" aria-label="Entradas e saídas por mês">
        <BarChart data={dados}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="rotulo" axisLine={false} tickLine={false} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          <Bar dataKey="entradas" name="Entradas" fill="var(--color-entradas)" radius={[6, 6, 0, 0]} />
          <Bar dataKey="saidas" name="Saídas" fill="var(--color-saidas)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ChartContainer>

      <ChartLegend
        className="flex-row flex-wrap gap-4"
        itens={[
          { nome: 'Entradas', cor: 'var(--entrada)' },
          { nome: 'Saídas', cor: 'var(--saida)' },
        ]}
      />
    </div>
  )
}
