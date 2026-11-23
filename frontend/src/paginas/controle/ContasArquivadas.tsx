import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { ApiError } from '../../api/cliente'
import { desarquivarConta, listarContas } from '../../api/contas'
import { CardConta } from '../../componentes/CardConta'
import { Button } from '@/components/ui/button'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { EstadoVazio } from '../../componentes/EstadoVazio'

export function ContasArquivadas() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const consulta = useQuery({
    queryKey: ['contas', 'arquivadas'],
    queryFn: () => listarContas({ arquivadas: true }),
  })
  const dados = consulta.data

  const desarquivar = useMutation({
    mutationFn: desarquivarConta,
    onSuccess: () => queryClient.invalidateQueries(),
  })

  return (
    <div className="flex flex-col gap-4 p-4">
      <CabecalhoTela titulo="Contas arquivadas" voltarPara="/controle/contas" />

      {consulta.isError && (
        <p role="alert" className="text-saida-texto">
          {consulta.error instanceof ApiError
            ? consulta.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {desarquivar.isError && (
        <p role="alert" className="text-saida-texto">
          {desarquivar.error instanceof ApiError
            ? desarquivar.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {!dados && !consulta.isError && <p className="text-muted-foreground">Carregando…</p>}

      {dados &&
        (dados.contas.length === 0 ? (
          <EstadoVazio
            frase="Nenhuma conta arquivada."
            acaoRotulo="Ver contas"
            onAcao={() => navigate('/controle/contas')}
          />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3">
            {dados.contas.map((conta) => (
              <li key={conta.id} className="flex flex-col gap-2">
                <CardConta
                  nome={conta.nome}
                  instituicao={conta.instituicao}
                  saldoAtual={conta.saldo_atual}
                  saldoPrevisto={conta.saldo_previsto}
                  onVerLancamentos={() => navigate(`/controle/contas/${conta.id}`)}
                />
                {!conta.casal_encerrado && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start"
                    disabled={desarquivar.isPending}
                    onClick={() => desarquivar.mutate(conta.id)}
                  >
                    Desarquivar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}
