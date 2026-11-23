import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { obterBalanco } from '../../api/controle'
import type { BalancoConta, DonoBalanco, Par } from '../../api/controle'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { Dinheiro } from '../../componentes/Dinheiro'
import { SeletorMes } from '../../componentes/SeletorMes'
import { TituloBloco } from '../../componentes/TituloBloco'
import { VisoesControle } from '../../componentes/VisoesControle'
import { useMes } from '../../hooks/useMes'

type TipoDinheiro = 'entrada' | 'saida' | 'neutro'

function BlocoPar({ rotulo, par, tipo = 'neutro' }: { rotulo: string; par: Par; tipo?: TipoDinheiro }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="m-0 text-13 text-muted-foreground">{rotulo}</p>
      <dl className="m-0 grid grid-cols-2 gap-3 [&_dd]:m-0 [&_dt]:text-13 [&_dt]:text-muted-foreground">
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

function CartaoConta({ conta }: { conta: BalancoConta }) {
  return (
    <section className="lg:min-w-0">
      <Card>
      <TituloBloco titulo={conta.nome} />
      <BlocoPar rotulo="Entradas" par={conta.entradas} tipo="entrada" />
      <BlocoPar rotulo="Saídas" par={conta.saidas} tipo="saida" />
      <BlocoPar rotulo="Saldo do mês" par={conta.saldo} />
      <div className="flex flex-col gap-1">
        <p className="m-0 text-13 text-muted-foreground">Saldo atual</p>
        <Dinheiro valor={conta.saldo_atual} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="m-0 text-13 text-muted-foreground">Saldo previsto</p>
        <Dinheiro valor={conta.saldo_previsto} />
      </div>
      <div className="flex flex-col gap-3 border-t pt-3">
        <h3 className="m-0 text-14 font-semibold">Transferências (informativo, não entram no saldo do mês)</h3>
        <BlocoPar rotulo="Entrada" par={conta.transferencias_entrada} />
        <BlocoPar rotulo="Saída" par={conta.transferencias_saida} />
      </div>
      </Card>
    </section>
  )
}

function CartaoDono({ dono }: { dono: DonoBalanco }) {
  return (
    <section className="lg:min-w-0">
      <Card>
      <TituloBloco titulo={dono.nome} />
      <BlocoPar rotulo="Entradas" par={dono.entradas} tipo="entrada" />
      <BlocoPar rotulo="Saídas" par={dono.saidas} tipo="saida" />
      <BlocoPar rotulo="Saldo do mês" par={dono.saldo} />
      </Card>
    </section>
  )
}

export function Balanco() {
  const { mes, setMes } = useMes()

  const consulta = useQuery({
    queryKey: ['balanco', mes],
    queryFn: () => obterBalanco(mes),
    enabled: mes !== '',
    // Erro 4xx é determinístico: não repete.
    retry: repetirSem4xx,
  })
  const dados = consulta.data

  return (
    <div className="flex flex-col gap-4 px-4 pb-4 md:px-6 md:pb-6">
      <div className="sticky top-0 z-10 flex flex-col gap-2 bg-background pb-2 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-x-4 lg:gap-y-2">
        <div className="lg:col-start-2 lg:row-start-2 lg:w-72">
          <SeletorMes mes={mes} onMudar={setMes} />
        </div>
        <div className="lg:col-span-2 lg:row-start-1">
          <CabecalhoTela titulo="Balanço do mês" />
        </div>
        <div className="lg:col-start-1 lg:row-start-2">
          <VisoesControle mes={mes} />
        </div>
      </div>

      {consulta.isError && (
        <p role="alert" className="m-0 text-saida-texto">
          {consulta.error instanceof ApiError
            ? consulta.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {!dados && !consulta.isError && <p className="m-0 text-muted-foreground">Carregando…</p>}

      {dados && (
        <>
          <section>
            <Card>
              <TituloBloco titulo="Total do mês" />
              <BlocoPar rotulo="Entradas" par={dados.total.entradas} tipo="entrada" />
              <BlocoPar rotulo="Saídas" par={dados.total.saidas} tipo="saida" />
              <BlocoPar rotulo="Saldo do mês" par={dados.total.saldo} />
            </Card>
          </section>

          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2">
            {dados.contas.map((conta) => (
              <CartaoConta key={conta.conta_id} conta={conta} />
            ))}

            {dados.donos.map((dono) => (
              <CartaoDono key={dono.dono_usuario_id ?? 'casal'} dono={dono} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
