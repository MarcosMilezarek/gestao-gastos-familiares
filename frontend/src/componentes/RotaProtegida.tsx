import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError, definirAoNaoAutenticado } from '../api/cliente'
import { removerDadosDoUsuario, useSessao } from '../hooks/useSessao'
import { Button } from '@/components/ui/button'

export function RotaProtegida() {
  const queryClient = useQueryClient()
  const { data, isPending, error, refetch } = useSessao()
  const erro401 = error instanceof ApiError && error.status === 401

  // Um 401 em qualquer chamada (fora de /api/sessao) encerra a sessão: a consulta de sessão volta ao estado inicial e falha, e a guarda leva ao login.
  useEffect(() => {
    definirAoNaoAutenticado(() => {
      removerDadosDoUsuario(queryClient)
      queryClient.resetQueries({ queryKey: ['sessao'] })
    })
    return () => definirAoNaoAutenticado(null)
  }, [queryClient])

  useEffect(() => {
    if (erro401) removerDadosDoUsuario(queryClient)
  }, [erro401, queryClient])

  if (isPending) return null
  if (erro401) return <Navigate to="/entrar" replace />
  if (data) return <Outlet />
  if (!error) return <Navigate to="/entrar" replace />
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-6 text-center text-muted-foreground">
      <p role="alert" className="m-0">
        {error.message}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
        Tentar de novo
      </Button>
    </div>
  )
}
