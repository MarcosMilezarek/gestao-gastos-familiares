import { CircleCheck, CircleDashed, CircleMinus, Lock, TriangleAlert, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { FaturaStatus } from '../../api/cartoes'
import type { BalancoConta, Par } from '../../api/controle'
import type { InicioSaida } from '../../api/inicio'
import type { CategoriaRelatorio } from '../../api/relatorios'
import { Dinheiro } from '../../componentes/Dinheiro'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import { GraficoRosca } from '../../componentes/GraficoRosca'
import { formatarData, rotuloMes } from '../../formatacao/data'
import styles from './inicio.module.css'

type BlocosAnaliseProps = { inicio: InicioSaida }

type TipoDinheiro = 'entrada' | 'saida' | 'neutro'

// Mesmo mapa de CardCartao: status da fatura com ícone e texto, além da cor (RNF-08).
const STATUS: Record<FaturaStatus, { rotulo: string; Icone: LucideIcon }> = {
  aberta: { rotulo: 'Aberta', Icone: CircleDashed },
  fechada: { rotulo: 'Fechada', Icone: Lock },
  vencida: { rotulo: 'Vencida', Icone: TriangleAlert },
  zerada: { rotulo: 'Zerada', Icone: CircleMinus },
  paga: { rotulo: 'Paga', Icone: CircleCheck },
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
    <div className={styles.par}>
      <p className={styles.rotulo}>{rotulo}</p>
      <dl className={styles.valores}>
        <div>
          <dt>Previsto</dt>
          <dd>
            <Dinheiro valor={par.previsto} tipo={tipo} />
          </dd>
        </div>
        <div>
          <dt>Realizado</dt>
          <dd>
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
      <section className={styles.bloco}>
        <h2 className={styles.tituloBloco}>Despesas por categoria</h2>
        {despesas_por_categoria.categorias.length === 0 ? (
          <EstadoVazio frase="Nenhuma despesa no mês." />
        ) : (
          <GraficoRosca itens={despesas_por_categoria.categorias.map(paraItemRosca)} />
        )}
      </section>

      <section className={styles.bloco}>
        <h2 className={styles.tituloBloco}>Balanço do mês por conta</h2>
        {balanco_contas.length === 0 ? (
          <EstadoVazio frase="Nenhuma conta ativa ainda." />
        ) : (
          balanco_contas.map((conta: BalancoConta) => (
            <section key={conta.conta_id} className={styles.card}>
              <h3 className={styles.nome}>{conta.nome}</h3>
              <LinhaPar rotulo="Entradas" par={conta.entradas} tipo="entrada" />
              <LinhaPar rotulo="Saídas" par={conta.saidas} tipo="saida" />
              <LinhaPar rotulo="Saldo do mês" par={conta.saldo} />
            </section>
          ))
        )}
      </section>

      <section className={styles.bloco}>
        <h2 className={styles.tituloBloco}>Próximas faturas</h2>
        {proximas_faturas.length === 0 ? (
          <EstadoVazio frase="Nenhuma fatura em aberto." />
        ) : (
          <ul className={`${styles.lista} ${styles.pendentes}`}>
            {proximas_faturas.map((fatura) => {
              const { rotulo, Icone } = STATUS[fatura.status]
              return (
                <li key={fatura.cartao_id}>
                  <Link
                    to={`/cartoes/${fatura.cartao_id}/faturas/${fatura.mes}`}
                    className={`${styles.card} ${styles.linkFatura}`}
                  >
                    <span className={styles.nome}>{fatura.cartao_nome}</span>
                    <Dinheiro valor={fatura.valor} />
                    <span>
                      Vencimento <time dateTime={fatura.vencimento}>{formatarData(fatura.vencimento)}</time>
                    </span>
                    <span className={`${styles.situacaoFatura} ${styles[fatura.status]}`}>
                      <Icone aria-hidden="true" size={16} />
                      {rotulo}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className={styles.bloco}>
        <h2 className={styles.tituloBloco}>Projeção de saldo</h2>
        {projecao.meses.length === 0 ? (
          <EstadoVazio frase="Sem projeção para mostrar." />
        ) : (
          <ul className={`${styles.lista} ${styles.pendentes}`}>
            {projecao.meses.map((mes) => (
              <li key={mes.mes} className={styles.linhaProjecao}>
                <span>{rotuloMes(mes.mes)}</span>
                <Dinheiro valor={mes.saldo_previsto} />
              </li>
            ))}
          </ul>
        )}
        <Link to="/projecao" className={styles.atalho}>
          Ver projeção
        </Link>
      </section>
    </>
  )
}
