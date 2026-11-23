import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { Card } from '@/components/ui/card'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { obterRelatorioProporcao } from '../../api/relatorios'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { CardsProporcao } from '../../componentes/CardsProporcao'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import { SeletorMes } from '../../componentes/SeletorMes'
import { TituloBloco } from '../../componentes/TituloBloco'
import { rotuloMes } from '../../formatacao/data'
import { useMes } from '../../hooks/useMes'

export function RelatorioProporcao() {
  const navigate = useNavigate()
  const { mes, setMes } = useMes()

  const consulta = useQuery({
    queryKey: ['relatorio-proporcao', mes],
    queryFn: () => obterRelatorioProporcao(mes),
    enabled: mes !== '',
    // Erro 4xx (ex.: SEM_VINCULO) é determinístico: não repete.
    retry: repetirSem4xx,
  })
  const dados = consulta.data

  const semVinculo = consulta.error instanceof ApiError && consulta.error.codigo === 'SEM_VINCULO'

  return (
    <div className="flex flex-col gap-4">
      <SeletorMes mes={mes} onMudar={setMes} />
      <CabecalhoTela titulo="Proporção e aporte" voltarPara={`/controle/relatorios?mes=${mes}`} />

      {semVinculo && (
        <Card>
          <EstadoVazio
            frase="Você ainda não está vinculado a um casal."
            acaoRotulo="Ir para o vínculo"
            onAcao={() => navigate('/configuracoes/vinculo')}
          />
        </Card>
      )}
      {consulta.isError && !semVinculo && (
        <p role="alert" className="text-14 text-saida-texto">
          {consulta.error instanceof ApiError
            ? consulta.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {!dados && !consulta.isError && <p className="text-14 text-muted-foreground">Carregando…</p>}

      {dados?.meses.map((item) => (
        <section key={item.mes} className="flex flex-col gap-3">
          <TituloBloco titulo={rotuloMes(item.mes)} />
          <CardsProporcao proporcao={item} />
        </section>
      ))}
    </div>
  )
}
