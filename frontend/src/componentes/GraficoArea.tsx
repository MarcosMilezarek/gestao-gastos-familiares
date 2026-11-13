import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatarBRL } from '../formatacao/dinheiro'
import css from './graficos.module.css'

type MesGrafico = { rotulo: string; valor: string }

type GraficoAreaProps = { meses: MesGrafico[] }

// Saldo por mês em área. Eixo de valores oculto: o número não aparece sem R$ (RNF-02).
export function GraficoArea({ meses }: GraficoAreaProps) {
  // Number só para o recharts desenhar a área; o texto exibido vem da string original.
  const dados = meses.map((mes) => ({
    rotulo: mes.rotulo,
    valor: Number(mes.valor),
    valorTexto: mes.valor,
  }))

  return (
    <div className={css.area} role="img" aria-label="Saldo previsto por mês">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={dados}>
          <CartesianGrid vertical={false} stroke="var(--cor-borda)" />
          <XAxis dataKey="rotulo" tick={{ fill: 'var(--cor-texto-suave)' }} />
          <YAxis hide />
          <Tooltip formatter={(_valor, _nome, dica) => formatarBRL(dica.payload.valorTexto)} />
          <Area
            dataKey="valor"
            name="Saldo previsto"
            stroke="var(--cor-primaria)"
            fill="var(--cor-primaria)"
            fillOpacity={0.2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
