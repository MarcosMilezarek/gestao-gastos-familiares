import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { obterInicio } from '../../api/inicio'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { BlocosAnalise } from './BlocosAnalise'
import { BlocosResumo } from './BlocosResumo'

// Início (RF-5.14): sem seletor de mês; os blocos aparecem sempre na mesma ordem.
export function Inicio() {
  const consulta = useQuery({
    queryKey: ['inicio'],
    queryFn: obterInicio,
    retry: repetirSem4xx,
  })
  const erroConsulta =
    consulta.error instanceof ApiError ? consulta.error.mensagem : 'Erro inesperado. Tente novamente.'

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      <div className="lg:col-span-2">
        <CabecalhoTela
          titulo="Início"
          acao={
            <Button asChild variant="secondary" size="icon">
              <Link to="/configuracoes" aria-label="Configurações">
                <Settings aria-hidden="true" />
              </Link>
            </Button>
          }
        />
      </div>

      {consulta.isError && (
        <p role="alert" className="text-14 text-saida-texto lg:col-span-2">
          {erroConsulta}
        </p>
      )}
      {!consulta.data && !consulta.isError && <p className="text-14 text-muted-foreground lg:col-span-2">Carregando…</p>}
      {consulta.data && <BlocosResumo inicio={consulta.data} />}
      {consulta.data && <BlocosAnalise inicio={consulta.data} />}
    </div>
  )
}
