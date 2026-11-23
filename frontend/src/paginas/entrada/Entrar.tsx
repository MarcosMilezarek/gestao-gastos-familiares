import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/cliente'
import { entrar } from '../../api/sessao'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Campo } from '../../componentes/Campo'
import { useSessao } from '../../hooks/useSessao'

export function Entrar() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')

  const mutation = useMutation({
    mutationFn: entrar,
    onSuccess: (sessao) => {
      queryClient.setQueryData(['sessao'], sessao)
      queryClient.invalidateQueries()
      navigate('/')
    },
  })

  const erroGeral = mutation.error ? mensagemDoErro(mutation.error) : undefined
  const { data, isError } = useSessao()

  if (data && !isError) return <Navigate to="/" replace />

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    mutation.mutate({ email, senha })
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[360px] flex-col justify-center gap-6 p-4">
      <h1 className="text-center text-22 font-bold">Entrar</h1>
      <Card>
      <form className="flex flex-col gap-4" onSubmit={enviar}>
        <Campo rotulo="E-mail">
          <Input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
          />
        </Campo>
        <Campo rotulo="Senha">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(evento) => setSenha(evento.target.value)}
          />
        </Campo>
        {erroGeral && (
          <p role="alert" className="text-14 text-saida-texto">
            {erroGeral}
          </p>
        )}
        <Button type="submit" disabled={mutation.isPending} className="w-full">
          Entrar
        </Button>
        <p className="text-center text-14 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center">
          Não tem conta? <Link to="/cadastrar" className="font-semibold text-primary-texto underline underline-offset-4">Cadastrar</Link>
        </p>
      </form>
      </Card>
    </main>
  )
}

function mensagemDoErro(erro: Error): string {
  return erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.'
}
