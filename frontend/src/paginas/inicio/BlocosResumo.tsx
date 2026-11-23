import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { ItemLancamentoLista } from '../../api/controle'
import type { InicioSaida } from '../../api/inicio'
import type { LancamentoSaida } from '../../api/lancamentos'
import type { ProporcaoSaida } from '../../api/proporcao'
import { CardsProporcao } from '../../componentes/CardsProporcao'
import { CartaoDestaque } from '../../componentes/CartaoDestaque'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import { ItemLancamento, type LancamentoItem } from '../../componentes/ItemLancamento'
import { TituloBloco } from '../../componentes/TituloBloco'
import { ConfirmarLancamento } from '../../formularios/ConfirmarLancamento'
import { useFormularios } from '../../formularios/FormulariosProvider'

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
  const chips = [
    ...saldos
      .filter((conta) => conta.dono_usuario_id !== null)
      .map((conta) => ({ rotulo: conta.nome, valor: conta.saldo_atual })),
    { rotulo: 'Faturas do mês', valor: total_faturas_mes },
  ]

  // Aporte vai da conta individual da pessoa para a conjunta; sem uma das duas, não há botão.
  // Só a primeira pessoa tem o botão primário: a tela tem um único primário.
  function botaoAporte(pessoa: PessoaProporcao): ReactNode {
    const origem = saldos.find((conta) => conta.dono_usuario_id === pessoa.usuario_id)
    if (!origem || !conjunta) return null
    const primeira = inicio.proporcao?.pessoas[0]?.usuario_id === pessoa.usuario_id
    return (
      <Button
        type="button"
        variant={primeira ? 'default' : 'outline'}
        onClick={() =>
          abrir('transferencia', undefined, undefined, undefined, {
            conta_id: origem.conta_id,
            conta_destino_id: conjunta.conta_id,
          })
        }
      >
        Fazer aporte
      </Button>
    )
  }

  return (
    <>
      <CartaoDestaque
        rotulo="Saldo da conta conjunta"
        valor={conjunta?.saldo_atual ?? '0.00'}
        chips={chips}
      />

      <section className="flex flex-col gap-2">
        <TituloBloco titulo="Aporte do mês" />
        {inicio.proporcao ? (
          <CardsProporcao proporcao={inicio.proporcao} acaoPessoa={botaoAporte} />
        ) : (
          <EstadoVazio compacto frase="Sem casal vinculado, não há proporção para mostrar." />
        )}
      </section>

      <section className="flex flex-col gap-2">
        <TituloBloco titulo="A confirmar e atrasadas" />
        {inicio.pendentes.length === 0 ? (
          <EstadoVazio compacto frase="Nenhum lançamento a confirmar." />
        ) : (
          <ul className="flex flex-col gap-3">
            {inicio.pendentes.map((item) => {
              if (item.kind !== 'lancamento') return null
              return (
                <ItemLancamento
                  key={item.lancamento.id}
                  item={paraLancamentoItem(item)}
                  aoConfirmar={() => setConfirmando(item.lancamento)}
                />
              )
            })}
          </ul>
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
