import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ApiError } from '../../api/cliente'
import { excluirTag, listarTags, type TagSaida } from '../../api/categorias'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { DialogoConfirmacao } from '../../componentes/DialogoConfirmacao'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import { FormTag } from './FormTag'

// Lista de tags: criar e renomear abrem o FormTag; excluir pede confirmação (RF-2.12, fatia-2.md §5.1).
export function Tags() {
  const queryClient = useQueryClient()
  const [criando, setCriando] = useState(false)
  const [renomeando, setRenomeando] = useState<TagSaida | null>(null)
  const [excluindo, setExcluindo] = useState<TagSaida | null>(null)

  const consulta = useQuery({ queryKey: ['tags'], queryFn: listarTags })
  const dados = consulta.data

  const excluir = useMutation({
    mutationFn: (id: number) => excluirTag(id),
    onSuccess: () => {
      // A tag sai dos lançamentos, que continuam; por isso invalida também os lançamentos.
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] })
      setExcluindo(null)
    },
    onError: () => setExcluindo(null),
  })

  return (
    <div className="flex flex-col gap-4 p-4">
      <CabecalhoTela
        titulo="Tags"
        voltarPara="/controle"
        acao={
          <Button type="button" size="sm" onClick={() => setCriando(true)}>
            Nova tag
          </Button>
        }
      />

      {consulta.isError && (
        <p role="alert" className="text-14 text-saida-texto">
          {consulta.error instanceof ApiError
            ? consulta.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {excluir.isError && (
        <p role="alert" className="text-14 text-saida-texto">
          {excluir.error instanceof ApiError
            ? excluir.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {!dados && !consulta.isError && <p className="text-14 text-muted-foreground">Carregando…</p>}

      {dados &&
        (dados.length === 0 ? (
          <EstadoVazio
            frase="Nenhuma tag criada."
            acaoRotulo="Nova tag"
            onAcao={() => setCriando(true)}
          />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {dados.map((tag) => (
              <li key={tag.id}>
                <Card className="gap-3 p-4">
                  <p className="m-0 min-w-0 truncate text-16 font-semibold">{tag.nome}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setRenomeando(tag)}
                    >
                      Renomear
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setExcluindo(tag)}
                    >
                      Excluir
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        ))}

      {criando && <FormTag aoFechar={() => setCriando(false)} />}
      {renomeando && (
        <FormTag key={renomeando.id} tag={renomeando} aoFechar={() => setRenomeando(null)} />
      )}
      {excluindo && (
        <DialogoConfirmacao
          titulo="Excluir tag"
          texto="A tag sai de todos os lançamentos, mas os lançamentos continuam guardados."
          rotuloAcao="Excluir"
          destrutivo
          onConfirmar={() => excluir.mutate(excluindo.id)}
          onCancelar={() => setExcluindo(null)}
        />
      )}
    </div>
  )
}
