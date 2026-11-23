import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/cliente'
import {
  criarCategoria,
  editarCategoria,
  type CategoriaSaida,
  type TipoCategoria,
} from '../../api/categorias'
import { BottomSheet } from '../../componentes/BottomSheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Campo } from '../../componentes/Campo'
import { SeletorCor } from '../../componentes/SeletorCor'
import { SeletorIcone } from '../../componentes/SeletorIcone'

type CategoriaItem = CategoriaSaida['subcategorias'][number]

// Ícone de quem cria sem escolher: "Outros" (nome da lista fechada em icones.ts).
const ICONE_INICIAL = 'ellipsis'

type FormCategoriaProps = {
  tipo: TipoCategoria
  pai?: CategoriaSaida
  categoria?: CategoriaItem
  aoFechar(): void
}

// Criação de categoria (ou subcategoria de `pai`) e edição de `categoria`. Cor só na raiz; Salário (fixa) não muda o nome.
export function FormCategoria({ tipo, pai, categoria, aoFechar }: FormCategoriaProps) {
  const queryClient = useQueryClient()
  const raiz = categoria ? categoria.categoria_pai_id === null : pai === undefined
  const nomeTravado = categoria?.fixa === true
  const [nome, setNome] = useState(categoria?.nome ?? '')
  const [icone, setIcone] = useState(categoria?.icone ?? ICONE_INICIAL)
  const [cor, setCor] = useState(categoria?.cor ?? '')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [aviso, setAviso] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Foco no primeiro controle marcado como inválido, na ordem da tela (erro do cliente ou da API).
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [erros])

  const salvar = useMutation({
    mutationFn: () => {
      const corDaRaiz = raiz && cor !== '' ? { cor } : {}
      if (categoria) {
        return editarCategoria(categoria.id, {
          ...(nomeTravado ? {} : { nome: nome.trim() }),
          icone,
          ...corDaRaiz,
        })
      }
      return criarCategoria({
        tipo,
        nome: nome.trim(),
        icone,
        ...corDaRaiz,
        ...(pai ? { categoria_pai_id: pai.id } : {}),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias'] })
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] })
      aoFechar()
    },
    onError: (erro) => {
      setErros(erro instanceof ApiError ? (erro.campos ?? {}) : {})
      setAviso(erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.')
    },
  })

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setAviso(null)
    // Mesma regra da API: a raiz nova precisa de cor (ordem da tela: nome, cor).
    const falhas: Record<string, string> = {}
    if (!nomeTravado && nome.trim() === '') falhas.nome = 'Informe o nome da categoria.'
    if (!categoria && raiz && cor === '') falhas.cor = 'Informe a cor da categoria.'
    setErros(falhas)
    if (Object.keys(falhas).length > 0) return
    salvar.mutate()
  }

  const titulo = categoria
    ? raiz
      ? 'Editar categoria'
      : 'Editar subcategoria'
    : pai
      ? 'Nova subcategoria'
      : 'Nova categoria'

  return (
    <BottomSheet
      titulo={titulo}
      aoFechar={aoFechar}
      rodape={
        <Button
          type="submit"
          form="form-categoria"
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

      <form ref={formRef} id="form-categoria" className="flex flex-col gap-4" onSubmit={enviar}>
        <Campo rotulo="Nome" erro={erros.nome}>
          <Input
            id="categoria-nome"
            value={nome}
            disabled={nomeTravado}
            onChange={(evento) => setNome(evento.target.value)}
            autoComplete="off"
          />
        </Campo>

        <div tabIndex={-1} aria-invalid={erros.icone ? true : undefined}>
          <SeletorIcone valor={icone} onChange={setIcone} />
        </div>
        {erros.icone && (
          <p role="alert" className="text-14 text-saida-texto">
            {erros.icone}
          </p>
        )}

        {raiz && (
          <>
            <div tabIndex={-1} aria-invalid={erros.cor ? true : undefined}>
              <SeletorCor valor={cor} onChange={setCor} />
            </div>
            {erros.cor && (
              <p role="alert" className="text-14 text-saida-texto">
                {erros.cor}
              </p>
            )}
          </>
        )}
      </form>
    </BottomSheet>
  )
}
