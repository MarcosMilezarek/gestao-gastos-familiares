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
    <div className="flex flex-col gap-4 px-4 pb-4">
      <div className="sticky top-0 z-10 flex flex-col gap-2 bg-background pb-2">
        <SeletorMes mes={mes} onMudar={setMes} />
        <CabecalhoTela titulo="Proporção e aporte do mês" />
        <VisoesControle mes={mes} />
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
        <>
          <section>
            <Card>
              <TituloBloco titulo="Base de despesas do casal" />
              <Dinheiro valor={dados.base_despesas_casal} />
              {eZero(dados.base_despesas_casal) && (
                <p className="m-0 text-muted-foreground">Sem despesas do casal neste mês</p>
              )}
            </Card>
          </section>
          <CardsProporcao proporcao={dados} />
        </>
      )}
    </div>
  )
}
