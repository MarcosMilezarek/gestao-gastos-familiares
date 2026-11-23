import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig, type PontoGrafico } from '@/components/ui/chart'
import { formatarBRL } from '../formatacao/dinheiro'

type MesGrafico = { rotulo: string; valor: string }

type GraficoAreaProps = { meses: MesGrafico[] }

const config: ChartConfig = { saldo: { label: 'Saldo previsto', color: 'var(--primary)' } }

// Saldo por mês em área. Eixo de valores oculto: o número não aparece sem R$ (RNF-02).
export function GraficoArea({ meses }: GraficoAreaProps) {
  // Number só para o recharts desenhar a área; o texto exibido vem da string original.
  const dados = meses.map((mes) => ({
    rotulo: mes.rotulo,
    valor: Number(mes.valor),
    texto: formatarBRL(mes.valor),
  })) satisfies (PontoGrafico & { rotulo: string })[]
  const ultimo = dados.length - 1

  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full" role="img" aria-label="Saldo previsto por mês">
      <AreaChart data={dados}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="rotulo" axisLine={false} tickLine={false} />
        <YAxis hide />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area
          dataKey="valor"
          name="Saldo previsto"
          type="monotone"
          stroke="var(--color-saldo)"
          strokeWidth={3}
          fill="var(--primary-suave)"
          dot={({ cx, cy, index }) =>
            index === ultimo ? (
              <circle key={index} cx={cx} cy={cy} r={7} fill="var(--primary)" stroke="var(--card)" strokeWidth={3} />
            ) : (
              <g key={index} />
            )
          }
          activeDot={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}
