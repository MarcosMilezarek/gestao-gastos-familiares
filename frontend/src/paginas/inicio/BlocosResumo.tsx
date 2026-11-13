import { useState, type ReactNode } from 'react'
import type { ItemLancamentoLista } from '../../api/controle'
import type { InicioSaida } from '../../api/inicio'
import type { LancamentoSaida } from '../../api/lancamentos'
import type { ProporcaoSaida } from '../../api/proporcao'
import { CardsProporcao } from '../../componentes/CardsProporcao'
import { CardsResumo } from '../../componentes/CardsResumo'
import { Dinheiro } from '../../componentes/Dinheiro'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import { ItemLancamento, type LancamentoItem } from '../../componentes/ItemLancamento'
import { ConfirmarLancamento } from '../../formularios/ConfirmarLancamento'
import { useFormularios } from '../../formularios/FormulariosProvider'
import styles from './inicio.module.css'

type BlocosResumoProps = { inicio: InicioSaida }

type PessoaProporcao = ProporcaoSaida['pessoas'][number]

// Mesmo mapa de ListaLancamentos (paraLancamentoItem, que não é exportado).
function paraLancamentoItem(item: ItemLancamentoLista): LancamentoItem {
  return {
    ...item.lancamento,
    rotulo: item.rotulo,
    conta_nome: item.conta_nome,
    conta_destino_nome: item.conta_destino_nome,
  }
}

// Blocos 1 a 3 do Início. Cada bloco sem dados mostra EstadoVazio e continua na tela (RF-5.21).
export function BlocosResumo({ inicio }: BlocosResumoProps) {
  const { abrir } = useFormularios()
  const [confirmando, setConfirmando] = useState<LancamentoSaida | null>(null)
  const { saldos, total_faturas_mes } = inicio.cards
  const conjunta = saldos.find((conta) => conta.dono_usuario_id === null)

  // Aporte vai da conta individual da pessoa para a conjunta; sem uma das duas, não há botão.
  function botaoAporte(pessoa: PessoaProporcao): ReactNode {
    const origem = saldos.find((conta) => conta.dono_usuario_id === pessoa.usuario_id)
    if (!origem || !conjunta) return null
    return (
      <button
        type="button"
        className={styles.aporte}
        onClick={() =>
          abrir('transferencia', undefined, undefined, undefined, {
            conta_id: origem.conta_id,
            conta_destino_id: conjunta.conta_id,
          })
        }
      >
        Fazer aporte
      </button>
    )
  }

  return (
    <>
      <section className={styles.bloco}>
        <h2 className={styles.tituloBloco}>Saldos e faturas do mês</h2>
        <CardsResumo>
          {saldos.map((conta) => (
            <section key={conta.conta_id} className={styles.card}>
              <h3 className={styles.nome}>{conta.nome}</h3>
              <Dinheiro valor={conta.saldo_atual} />
            </section>
          ))}
          <section className={styles.card}>
            <h3 className={styles.nome}>Faturas do mês</h3>
            <Dinheiro valor={total_faturas_mes} />
          </section>
        </CardsResumo>
        {saldos.length === 0 && <EstadoVazio frase="Nenhuma conta ativa ainda." />}
      </section>

      <section className={styles.bloco}>
        <h2 className={styles.tituloBloco}>Proporção e aporte</h2>
        {inicio.proporcao ? (
          <CardsProporcao proporcao={inicio.proporcao} acaoPessoa={botaoAporte} />
        ) : (
          <EstadoVazio frase="Sem casal vinculado, não há proporção para mostrar." />
        )}
      </section>

      <section className={styles.bloco}>
        <h2 className={styles.tituloBloco}>A confirmar e atrasadas</h2>
        {inicio.pendentes.length === 0 ? (
          <EstadoVazio frase="Nenhum lançamento a confirmar." />
        ) : (
          <div className={styles.pendentes}>
            {inicio.pendentes.map((item) => {
              if (item.kind !== 'lancamento') return null
              const atrasada = item.lancamento.situacao === 'atrasada'
              // Um item por lista: ItemLancamento é um <li>, e o destaque fica no bloco que o envolve.
              return (
                <div key={item.lancamento.id} className={atrasada ? styles.atrasada : undefined}>
                  <ul className={styles.lista}>
                    <ItemLancamento
                      item={paraLancamentoItem(item)}
                      aoConfirmar={() => setConfirmando(item.lancamento)}
                    />
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {confirmando && (
        <ConfirmarLancamento
          key={confirmando.id}
          lancamento={confirmando}
          aoFechar={() => setConfirmando(null)}
        />
      )}
    </>
  )
}
