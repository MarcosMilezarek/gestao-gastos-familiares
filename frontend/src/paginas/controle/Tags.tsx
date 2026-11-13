import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/cliente'
import { excluirTag, listarTags, type TagSaida } from '../../api/categorias'
import { DialogoConfirmacao } from '../../componentes/DialogoConfirmacao'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import estado from '../../componentes/estado.module.css'
import contas from '../../componentes/cardConta.module.css'
import styles from './controle.module.css'
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
    <div className={styles.pagina}>
      <h1 className={styles.titulo}>Tags</h1>
      <button type="button" className={estado.acao} onClick={() => setCriando(true)}>
        Nova tag
      </button>

      {consulta.isError && (
        <p role="alert" className={styles.erro}>
          {consulta.error instanceof ApiError
            ? consulta.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {excluir.isError && (
        <p role="alert" className={styles.erro}>
          {excluir.error instanceof ApiError
            ? excluir.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {!dados && !consulta.isError && <p className={styles.aviso}>Carregando…</p>}

      {dados &&
        (dados.length === 0 ? (
          <EstadoVazio
            frase="Nenhuma tag criada."
            acaoRotulo="Nova tag"
            onAcao={() => setCriando(true)}
          />
        ) : (
          <ul className={contas.lista}>
            {dados.map((tag) => (
              <li key={tag.id} className={contas.card}>
                <p className={contas.nomeConta}>{tag.nome}</p>
                <div className={contas.acoes}>
                  <button
                    type="button"
                    className={contas.acao}
                    onClick={() => setRenomeando(tag)}
                  >
                    Renomear
                  </button>
                  <button
                    type="button"
                    className={contas.acao}
                    onClick={() => setExcluindo(tag)}
                  >
                    Excluir
                  </button>
                </div>
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
          onConfirmar={() => excluir.mutate(excluindo.id)}
          onCancelar={() => setExcluindo(null)}
        />
      )}
    </div>
  )
}
