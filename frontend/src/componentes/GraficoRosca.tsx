import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatarBRL } from '../formatacao/dinheiro'
import { formatarPercentual } from '../formatacao/percentual'
import { Dinheiro } from './Dinheiro'
import css from './graficos.module.css'

type ItemRosca = {
  chave: string
  nome: string
  valor: string
  porcentagem: string
  cor: string | null
}

type GraficoRoscaProps = { itens: ItemRosca[]; rotulo?: string }

const COR_SEM_CATEGORIA = 'var(--cor-texto-suave)'

// Rosca e lista lado a lado em texto: a informação não depende só da cor (RNF-08).
export function GraficoRosca({ itens, rotulo = 'Distribuição por categoria' }: GraficoRoscaProps) {
  // Valor zero ou negativo (ajuste de fatura) não tem fatia; continua na lista.
  const fatias = itens.filter((item) => Number(item.valor) > 0)
  // Number só para o recharts desenhar as fatias; o texto exibido vem da string original.
  const dados = fatias.map((item) => ({
    chave: item.chave,
    nome: item.nome,
    valor: Number(item.valor),
    valorTexto: item.valor,
  }))

  return (
    <div className={css.rosca}>
      <div className={css.area} role="img" aria-label={rotulo}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={dados} dataKey="valor" nameKey="nome" innerRadius="55%" outerRadius="90%">
              {fatias.map((item) => (
                <Cell key={item.chave} fill={item.cor ?? COR_SEM_CATEGORIA} />
              ))}
            </Pie>
            <Tooltip formatter={(_valor, _nome, dica) => formatarBRL(dica.payload.valorTexto)} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className={css.lista}>
        {itens.map((item) => (
          <li key={item.chave} className={css.item}>
            <span
              className={css.amostra}
              style={{ background: item.cor ?? COR_SEM_CATEGORIA }}
              aria-hidden="true"
            />
            <span className={css.nomeItem}>{item.nome}</span>
            <Dinheiro valor={item.valor} />
            <span className={css.porcentagem}>{formatarPercentual(item.porcentagem)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
