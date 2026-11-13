import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/cliente'
import { entrar } from '../../api/sessao'
import { Campo } from '../../componentes/Campo'
import { useSessao } from '../../hooks/useSessao'
import css from './entrada.module.css'

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
    <main className={css.pagina}>
      <form className={css.formulario} onSubmit={enviar}>
        <h1 className={css.titulo}>Entrar</h1>
        <Campo rotulo="E-mail">
          <input
            type="email"
            autoComplete="email"
            required
            className={css.controle}
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
          />
        </Campo>
        <Campo rotulo="Senha">
          <input
            type="password"
            autoComplete="current-password"
            required
            className={css.controle}
            value={senha}
            onChange={(evento) => setSenha(evento.target.value)}
          />
        </Campo>
        {erroGeral && (
          <p role="alert" className={css.erroGeral}>
            {erroGeral}
          </p>
        )}
        <button type="submit" className={css.botao} disabled={mutation.isPending}>
          Entrar
        </button>
        <p className={css.apoio}>
          Não tem conta? <Link to="/cadastrar" className={css.link}>Cadastrar</Link>
        </p>
      </form>
    </main>
  )
}

function mensagemDoErro(erro: Error): string {
  return erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.'
}
