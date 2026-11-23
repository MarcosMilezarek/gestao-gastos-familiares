import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/cliente'
import { excluirLancamento } from '../../api/lancamentos'
import { excluirRendimento, type MetaDetalhe, type MovimentoMeta } from '../../api/metas'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dinheiro } from '../../componentes/Dinheiro'
import { DialogoConfirmacao } from '../../componentes/DialogoConfirmacao'
import { SituacaoIcone } from '../../componentes/SituacaoIcone'
import { TituloBloco } from '../../componentes/TituloBloco'
import { ConfirmarLancamento } from '../../formularios/ConfirmarLancamento'
import { formatarData } from '../../formatacao/data'
import { eNegativo } from '../../formatacao/dinheiro'
import { FormAtualizarValor } from './FormAtualizarValor'
import { FormMovimentoMeta } from './FormMovimentoMeta'

const ROTULOS: Record<MovimentoMeta['tipo'], string> = {
  inicial: 'Valor inicial',
  aplicacao: 'Aplicação',
  resgate: 'Resgate',
  rendimento: 'Rendimento',
}

type Acao = {
  tipo: 'editar' | 'confirmar' | 'excluir'
  movimento: MovimentoMeta
}

type Props = { meta: MetaDetalhe }

// Histórico de movimentos da meta com as ações de cada um (fatia-6.md §5.1, 6.F5).
// Inicial não tem ações; com casal encerrado nenhum movimento tem ações.
export function HistoricoMeta({ meta }: Props) {
  const queryClient = useQueryClient()
  const [acao, setAcao] = useState<Acao | null>(null)

  const excluir = useMutation({
    mutationFn: (movimento: MovimentoMeta) => {
      if (movimento.id === null) throw new Error('Movimento sem identificador.')
      return movimento.tipo === 'rendimento'
        ? excluirRendimento(meta.id, movimento.id)
        : excluirLancamento(movimento.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries()
    },
    onSettled: () => setAcao(null),
  })

  function fechar() {
    setAcao(null)
  }

  const erroExcluir =
    excluir.error instanceof ApiError ? excluir.error.mensagem : 'Erro inesperado. Tente novamente.'

  return (
    <Card>
      <TituloBloco titulo="Histórico" />

      {excluir.isError && (
        <p role="alert" className="text-14 font-medium text-saida-texto">
          {erroExcluir}
        </p>
      )}

      <ul className="flex flex-col divide-y">
        {meta.movimentos.map((movimento) => {
          const podeAgir =
            !meta.casal_encerrado && movimento.tipo !== 'inicial' && movimento.id !== null
          return (
            <li
              key={`${movimento.tipo}-${movimento.id}`}
              className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-14 font-semibold">{ROTULOS[movimento.tipo]}</span>
                  <time
                    className="text-13 text-muted-foreground tabular-nums"
                    dateTime={movimento.data}
                  >
                    {formatarData(movimento.data)}
                  </time>
                  {movimento.descricao && (
                    <span className="text-13 text-muted-foreground">{movimento.descricao}</span>
                  )}
                  {movimento.situacao && <SituacaoIcone situacao={movimento.situacao} />}
                </div>
                {/* O valor já traz o sinal do efeito na meta: resgate negativo, rendimento ± */}
                <Dinheiro
                  valor={movimento.valor}
                  tipo={eNegativo(movimento.valor) ? 'saida' : 'entrada'}
                />
              </div>
              {podeAgir && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setAcao({ tipo: 'editar', movimento })}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setAcao({ tipo: 'excluir', movimento })}
                  >
                    Excluir
                  </Button>
                  {movimento.tipo !== 'rendimento' && movimento.situacao !== 'confirmada' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setAcao({ tipo: 'confirmar', movimento })}
                    >
                      Confirmar
                    </Button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {acao?.tipo === 'editar' &&
        (acao.movimento.tipo === 'rendimento' ? (
          <FormAtualizarValor metaId={meta.id} movimento={acao.movimento} aoFechar={fechar} />
        ) : acao.movimento.tipo === 'inicial' ? null : (
          <FormMovimentoMeta
            metaId={meta.id}
            tipo={acao.movimento.tipo}
            movimento={acao.movimento}
            aoFechar={fechar}
          />
        ))}

      {acao?.tipo === 'confirmar' && acao.movimento.id !== null && (
        <ConfirmarLancamento
          lancamento={{
            id: acao.movimento.id,
            // Resgate vem negativo na meta; o campo da confirmação não aceita sinal.
            valor: acao.movimento.valor.replace('-', ''),
          }}
          aoFechar={fechar}
        />
      )}

      {acao?.tipo === 'excluir' && (
        <DialogoConfirmacao
          titulo="Excluir movimento"
          texto="Excluir este movimento?"
          rotuloAcao="Excluir"
          onConfirmar={() => excluir.mutate(acao.movimento)}
          onCancelar={fechar}
        />
      )}
    </Card>
  )
}
