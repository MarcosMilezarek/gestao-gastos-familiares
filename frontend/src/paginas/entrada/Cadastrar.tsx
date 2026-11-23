import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/cliente'
import { cadastrar } from '../../api/sessao'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Campo } from '../../componentes/Campo'
import { useSessao } from '../../hooks/useSessao'

type Valores = { nome: string; email: string; senha: string; senha_confirmacao: string }

const VAZIOS: Valores = { nome: '', email: '', senha: '', senha_confirmacao: '' }
const CAMPOS = Object.keys(VAZIOS) as (keyof Valores)[]

export function Cadastrar() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const formRef = useRef<HTMLFormElement>(null)
  const [valores, setValores] = useState<Valores>(VAZIOS)

  const mutation = useMutation({
    mutationFn: cadastrar,
    onSuccess: (sessao) => {
      queryClient.setQueryData(['sessao'], sessao)
      queryClient.invalidateQueries()
      navigate('/')
    },
  })

  const campos = mutation.error instanceof ApiError ? (mutation.error.campos ?? {}) : {}
  const temErroEmCampo = CAMPOS.some((campo) => campos[campo])
  const erroGeral =
    mutation.error && !temErroEmCampo ? mensagemDoErro(mutation.error) : undefined

  // Foco no primeiro campo com erro (ordem do formulário).
  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus()
  }, [mutation.error])

  const { data, isError } = useSessao()

  if (data && !isError) return <Navigate to="/" replace />

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    mutation.mutate(valores)
  }

  function alterar(campo: keyof Valores) {
    return (evento: ChangeEvent<HTMLInputElement>) =>
      setValores((atuais) => ({ ...atuais, [campo]: evento.target.value }))
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[360px] flex-col justify-center gap-6 p-4">
      <h1 className="text-center text-22 font-bold">Cadastrar</h1>
      <Card>
      <form ref={formRef} className="flex flex-col gap-4" onSubmit={enviar}>
        <Campo rotulo="Nome" erro={campos.nome}>
          <Input
            type="text"
            autoComplete="name"
            required
            value={valores.nome}
            onChange={alterar('nome')}
          />
        </Campo>
        <Campo rotulo="E-mail" erro={campos.email}>
          <Input
            type="email"
            autoComplete="email"
            required
            value={valores.email}
            onChange={alterar('email')}
          />
        </Campo>
        <Campo rotulo="Senha" erro={campos.senha} ajuda="Use de 8 a 128 caracteres.">
          <Input
            type="password"
            autoComplete="new-password"
            required
            value={valores.senha}
            onChange={alterar('senha')}
          />
        </Campo>
        <Campo rotulo="Confirmar senha" erro={campos.senha_confirmacao}>
          <Input
            type="password"
            autoComplete="new-password"
            required
            value={valores.senha_confirmacao}
            onChange={alterar('senha_confirmacao')}
          />
        </Campo>
        {erroGeral && (
          <p role="alert" className="text-14 text-saida-texto">
            {erroGeral}
          </p>
        )}
        <Button type="submit" disabled={mutation.isPending} className="w-full">
          Cadastrar
        </Button>
        <p className="text-center text-14 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center">
          Já tem conta? <Link to="/entrar" className="font-semibold text-primary-texto underline underline-offset-4">Entrar</Link>
        </p>
      </form>
      </Card>
    </main>
  )
}

function mensagemDoErro(erro: Error): string {
  return erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.'
}
