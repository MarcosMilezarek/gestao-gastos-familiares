import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { formatarBRL } from '../formatacao/dinheiro'
import css from './graficos.module.css'

type MesGrafico = { rotulo: string; entradas: string; saidas: string }

type GraficoBarrasProps = { meses: MesGrafico[] }

// Entradas e saídas lado a lado; a legenda é texto, não só cor (RNF-08).
export function GraficoBarras({ meses }: GraficoBarrasProps) {
  // Number só para o recharts desenhar as barras; o texto exibido vem da string original.
  const dados = meses.map((mes) => ({
    rotulo: mes.rotulo,
    entradas: Number(mes.entradas),
    saidas: Number(mes.saidas),
    entradasTexto: mes.entradas,
    saidasTexto: mes.saidas,
  }))

  return (
    <div className={css.barras}>
      <div className={css.area} role="img" aria-label="Entradas e saídas por mês">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados}>
            <CartesianGrid vertical={false} stroke="var(--cor-borda)" />
            <XAxis dataKey="rotulo" tick={{ fill: 'var(--cor-texto-suave)' }} />
            <Tooltip
              formatter={(_valor, _nome, dica) =>
                formatarBRL(
                  dica.dataKey === 'entradas' ? dica.payload.entradasTexto : dica.payload.saidasTexto,
                )
              }
            />
            <Bar dataKey="entradas" name="Entradas" fill="var(--cor-entrada)" />
            <Bar dataKey="saidas" name="Saídas" fill="var(--cor-saida)" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ul className={css.legenda}>
        <li className={css.legendaItem}>
          <span className={`${css.amostra} ${css.amostraEntrada}`} aria-hidden="true" />
          Entradas
        </li>
        <li className={css.legendaItem}>
          <span className={`${css.amostra} ${css.amostraSaida}`} aria-hidden="true" />
          Saídas
        </li>
      </ul>
    </div>
  )
}
