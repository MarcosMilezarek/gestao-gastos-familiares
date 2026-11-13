import { useQuery, type QueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { ApiError } from '../api/cliente'
import { obterSessao, type Sessao } from '../api/sessao'

export function useSessao(): UseQueryResult<Sessao, ApiError> {
  return useQuery<Sessao, ApiError>({
    queryKey: ['sessao'],
    queryFn: obterSessao,
    retry: false,
  })
}

// Remove tudo do cache menos a sessão, sem clear(): observadores montados não ficam presos a consultas removidas.
export function removerDadosDoUsuario(queryClient: QueryClient) {
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'sessao' })
}
