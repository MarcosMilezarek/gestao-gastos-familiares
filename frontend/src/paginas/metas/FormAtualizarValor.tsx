import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/cliente'
import {
  editarRendimento,
  registrarRendimento,
  type MovimentoMeta,
} from '../../api/metas'
import { BottomSheet } from '../../componentes/BottomSheet'
import { Campo } from '../../componentes/Campo'
import estado from '../../componentes/estado.module.css'
import css from '../../formularios/formularios.module.css'
import { mascararEntrada, paraApi } from '../../formatacao/dinheiro'
import { CampoValor, paraTexto, paraValorApi } from '../controle/FormConta'

type Props = {
  metaId: number
  // Rendimento em edição; ausente na criação (valor atual informado).
  movimento?: MovimentoMeta
  // Valor atual da meta, que é o ponto de partida do campo na criação.
  valorAtual?: string
  aoFechar(): void
}

// Valor da API ("1234.50") -> texto mascarado ("1.234,50"), sem passar por number (mesmo padrão de FormMeta).
function paraCampo(valor: string): string {
  const [inteiro = '0', centavos = ''] = valor.split('.')
  return mascararEntrada(inteiro + centavos.padEnd(2, '0'))
}

// Atualizar o valor atual da meta (registra um rendimento) ou editar um rendimento (fatia-6.md §5.1, 6.F6).
export function FormAtualizarValor({ metaId, movimento, valorAtual, aoFechar }: Props) {
  const editando = movimento !== undefined
  const queryClient = useQueryClient()
  const corpoRef = useRef<HTMLDivElement>(null)

  // Na criação o campo parte do valor atual da meta; na edição o rendimento pode ser negativo.
  const [valor, setValor] = useState(() => {
    if (movimento) return paraTexto(movimento.valor)
    return valorAtual !== undefined ? paraCampo(valorAtual) : mascararEntrada('')
  })
  const [data, setData] = useState(movimento?.data ?? '')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [aviso, setAviso] = useState<string>()

  // Foco no primeiro controle marcado como inválido, na ordem da tela.
  useEffect(() => {
    corpoRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [erros])

  function aoTerminar() {
    queryClient.invalidateQueries()
    aoFechar()
  }

  function aoFalhar(erro: Error) {
    setErros(erro instanceof ApiError ? (erro.campos ?? {}) : {})
    setAviso(erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.')
  }

  // Resposta com `rendimento: null` (valor igual ao atual): nada foi gravado; o formulário fica aberto com o aviso.
  const criar = useMutation({
    mutationFn: () => registrarRendimento(metaId, { valor_atual: paraApi(valor) }),
    onSuccess: (resposta) => {
      if (resposta.rendimento !== null) {
        aoTerminar()
        return
      }
      queryClient.invalidateQueries()
      setAviso('O valor informado é igual ao valor atual da meta; nada foi alterado.')
    },
    onError: aoFalhar,
  })

  const editar = useMutation({
    mutationFn: () => {
      const id = movimento?.id
      if (id == null) throw new Error('Rendimento sem identificador.')
      return editarRendimento(metaId, id, { valor: paraValorApi(valor), data })
    },
    onSuccess: aoTerminar,
    onError: aoFalhar,
  })

  const pendente = criar.isPending || editar.isPending

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setErros({})
    setAviso(undefined)
    if (editando) editar.mutate()
    else criar.mutate()
  }

  return (
    <BottomSheet
      titulo={editando ? 'Editar rendimento' : 'Atualizar valor atual'}
      aoFechar={aoFechar}
      rodape={
        <button
          type="submit"
          form="form-atualizar-valor"
          className={estado.acao}
          disabled={pendente}
        >
          Salvar
        </button>
      }
    >
      <div ref={corpoRef}>
        {aviso && (
          <p role="alert" className={css.erro}>
            {aviso}
          </p>
        )}

        <form id="form-atualizar-valor" className={css.campos} onSubmit={enviar}>
          {editando ? (
            <>
              <CampoValor
                id="rendimento-valor"
                rotulo="Valor"
                texto={valor}
                erro={erros.valor}
                aoMudar={setValor}
              />
              <Campo rotulo="Data" erro={erros.data}>
                <input
                  className={css.controle}
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </Campo>
            </>
          ) : (
            <Campo rotulo="Valor atual" erro={erros.valor_atual ?? erros.valor}>
              <input
                className={css.controle}
                type="text"
                inputMode="numeric"
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(mascararEntrada(e.target.value))}
              />
            </Campo>
          )}
        </form>
      </div>
    </BottomSheet>
  )
}
