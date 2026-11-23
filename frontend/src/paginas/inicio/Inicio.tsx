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
    <div className="flex flex-col gap-6 p-4">
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

      {consulta.isError && (
        <p role="alert" className="text-14 text-saida-texto">
          {erroConsulta}
        </p>
      )}
      {!consulta.data && !consulta.isError && <p className="text-14 text-muted-foreground">Carregando…</p>}
      {consulta.data && <BlocosResumo inicio={consulta.data} />}
      {consulta.data && <BlocosAnalise inicio={consulta.data} />}
    </div>
  )
}
