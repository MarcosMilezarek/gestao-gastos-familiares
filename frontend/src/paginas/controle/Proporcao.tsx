import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { Card } from '@/components/ui/card'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { obterProporcao } from '../../api/proporcao'
import { CardsProporcao } from '../../componentes/CardsProporcao'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { Dinheiro } from '../../componentes/Dinheiro'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import { SeletorMes } from '../../componentes/SeletorMes'
import { TituloBloco } from '../../componentes/TituloBloco'
import { VisoesControle } from '../../componentes/VisoesControle'
import { eZero } from '../../formatacao/dinheiro'
import { useMes } from '../../hooks/useMes'

export function Proporcao() {
  const navigate = useNavigate()
  const { mes, setMes } = useMes()

  const consulta = useQuery({
    queryKey: ['proporcao', mes],
    queryFn: () => obterProporcao(mes),
    enabled: mes !== '',
    // Erro 4xx (ex.: SEM_VINCULO, 409) é determinístico: não repete.
    retry: repetirSem4xx,
  })
  const dados = consulta.data

  const semVinculo = consulta.error instanceof ApiError && consulta.error.codigo === 'SEM_VINCULO'

  return (
    <div className="flex flex-col gap-4 px-4 pb-4 md:px-6 md:pb-6">
      <div className="sticky top-0 z-10 flex flex-col gap-2 bg-background pb-2 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-x-4 lg:gap-y-2">
        <div className="lg:col-start-2 lg:row-start-2 lg:w-72">
          <SeletorMes mes={mes} onMudar={setMes} />
        </div>
        <div className="lg:col-span-2 lg:row-start-1">
          <CabecalhoTela titulo="Proporção e aporte do mês" />
        </div>
        <div className="lg:col-start-1 lg:row-start-2">
          <VisoesControle mes={mes} />
        </div>
      </div>

      {semVinculo && (
        <EstadoVazio
          frase="Você ainda não está vinculado a um casal."
          acaoRotulo="Ir para o vínculo"
          onAcao={() => navigate('/configuracoes/vinculo')}
        />
      )}
      {consulta.isError && !semVinculo && (
        <p role="alert" className="m-0 text-saida-texto">
          {consulta.error instanceof ApiError
            ? consulta.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {!dados && !consulta.isError && <p className="m-0 text-muted-foreground">Carregando…</p>}

      {dados && (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
          <section className="lg:min-w-0">
            <Card>
              <TituloBloco titulo="Base de despesas do casal" />
              <Dinheiro valor={dados.base_despesas_casal} />
              {eZero(dados.base_despesas_casal) && (
                <p className="m-0 text-muted-foreground">Sem despesas do casal neste mês</p>
              )}
            </Card>
          </section>
          <div className="lg:min-w-0">
            <CardsProporcao proporcao={dados} />
          </div>
        </div>
      )}
    </div>
  )
}
