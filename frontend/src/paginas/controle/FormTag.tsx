import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/cliente'
import { criarTag, editarTag, type TagSaida } from '../../api/categorias'
import { BottomSheet } from '../../componentes/BottomSheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Campo } from '../../componentes/Campo'

const TAMANHO_MAXIMO = 40

type FormTagProps = {
  // Sem tag: criação. Com tag: renomear.
  tag?: TagSaida
  aoFechar(): void
}

// Criar ou renomear uma tag (fatia-2.md §3.3, 2.F11). TAG_JA_EXISTE chega em campos.nome.
export function FormTag({ tag, aoFechar }: FormTagProps) {
  const queryClient = useQueryClient()
  const [nome, setNome] = useState(tag?.nome ?? '')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [aviso, setAviso] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Foco no primeiro controle marcado como inválido (erro do cliente ou da API).
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [erros])

  const salvar = useMutation({
    mutationFn: () => {
      const corpo = { nome: nome.trim() }
      return tag ? editarTag(tag.id, corpo) : criarTag(corpo)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] })
      aoFechar()
    },
    onError: (erro) => {
      const campos = erro instanceof ApiError ? (erro.campos ?? {}) : {}
      setErros(campos)
      setAviso(erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.')
    },
  })

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setErros({})
    setAviso(null)
    const limpo = nome.trim()
    if (limpo === '') {
      setErros({ nome: 'Informe o nome da tag.' })
      return
    }
    if ([...limpo].length > TAMANHO_MAXIMO) {
      setErros({ nome: `Use no máximo ${TAMANHO_MAXIMO} caracteres.` })
      return
    }
    salvar.mutate()
  }

  return (
    <BottomSheet
      titulo={tag ? 'Renomear tag' : 'Nova tag'}
      aoFechar={aoFechar}
      rodape={
        <Button
          type="submit"
          form="form-tag"
          disabled={salvar.isPending}
        >
          Salvar
        </Button>
      }
    >
      {aviso && (
        <p role="alert" className="text-14 text-saida-texto">
          {aviso}
        </p>
      )}

      <form ref={formRef} id="form-tag" className="flex flex-col gap-4" onSubmit={enviar}>
        <Campo rotulo="Nome" erro={erros.nome}>
          <Input
            id="tag-nome"
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            autoComplete="off"
          />
        </Campo>
      </form>
    </BottomSheet>
  )
}
