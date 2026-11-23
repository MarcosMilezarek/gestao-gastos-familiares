import { Cell, Pie, PieChart } from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
  type PontoGrafico,
} from '@/components/ui/chart'
import { formatarBRL } from '../formatacao/dinheiro'
import { formatarPercentual } from '../formatacao/percentual'

type ItemRosca = {
  chave: string
  nome: string
  valor: string
  porcentagem: string
  cor: string | null
}

type GraficoRoscaProps = { itens: ItemRosca[]; rotulo?: string }

const COR_SEM_CATEGORIA = 'var(--muted-foreground)'

// Rosca e lista em texto: a informação não depende só da cor (RNF-08).
export function GraficoRosca({ itens, rotulo = 'Distribuição por categoria' }: GraficoRoscaProps) {
  // Valor zero ou negativo (ajuste de fatura) não tem fatia; continua na lista.
  const fatias = itens.filter((item) => Number(item.valor) > 0)
  // Number só para o recharts desenhar as fatias; o texto exibido vem da string original.
  const dados = fatias.map((item) => ({
    chave: item.chave,
    nome: item.nome,
    valor: Number(item.valor),
    texto: `${item.nome}: ${formatarBRL(item.valor)}`,
  })) satisfies (PontoGrafico & { chave: string; nome: string })[]
  const config: ChartConfig = Object.fromEntries(
    fatias.map((item) => [item.chave, { label: item.nome, color: item.cor ?? COR_SEM_CATEGORIA }]),
  )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <ChartContainer config={config} className="aspect-auto h-40 w-full" role="img" aria-label={rotulo}>
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent />} />
            <Pie data={dados} dataKey="valor" nameKey="nome" innerRadius="70%" outerRadius="100%" stroke="none">
              {fatias.map((item) => (
                <Cell key={item.chave} fill={`var(--color-${item.chave})`} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      </div>

      <ChartLegend
        itens={itens.map((item) => ({
          chave: item.chave,
          nome: item.nome,
          cor: item.cor ?? COR_SEM_CATEGORIA,
          valor: formatarBRL(item.valor),
          porcentagem: formatarPercentual(item.porcentagem),
        }))}
      />
    </div>
  )
}
