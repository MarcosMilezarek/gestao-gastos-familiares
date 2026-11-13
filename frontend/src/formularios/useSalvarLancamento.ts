import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  criarLancamento,
  editarLancamento,
  type LancamentoEdicao,
  type LancamentoEntrada,
} from '../api/lancamentos'
import type { Alcance } from '../componentes/DialogoAlcance'

// Sem `id` cria (POST); com `id` edita (PATCH), com o `alcance` escolhido. Todo salvamento invalida o cache.
export function useSalvarLancamento(id?: number, alcance?: Alcance) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (corpo: LancamentoEntrada | LancamentoEdicao) =>
      id === undefined
        ? criarLancamento(corpo as LancamentoEntrada)
        : editarLancamento(id, corpo, alcance),
    onSuccess: () => queryClient.invalidateQueries(),
  })
}
