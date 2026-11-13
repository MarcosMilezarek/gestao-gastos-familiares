import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/cliente'
import { cadastrar } from '../../api/sessao'
import { Campo } from '../../componentes/Campo'
import { useSessao } from '../../hooks/useSessao'
import css from './entrada.module.css'

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
    <main className={css.pagina}>
      <form ref={formRef} className={css.formulario} onSubmit={enviar}>
        <h1 className={css.titulo}>Cadastrar</h1>
        <Campo rotulo="Nome" erro={campos.nome}>
          <input
            type="text"
            autoComplete="name"
            required
            className={css.controle}
            value={valores.nome}
            onChange={alterar('nome')}
          />
        </Campo>
        <Campo rotulo="E-mail" erro={campos.email}>
          <input
            type="email"
            autoComplete="email"
            required
            className={css.controle}
            value={valores.email}
            onChange={alterar('email')}
          />
        </Campo>
        <Campo rotulo="Senha" erro={campos.senha} ajuda="Use de 8 a 128 caracteres.">
          <input
            type="password"
            autoComplete="new-password"
            required
            className={css.controle}
            value={valores.senha}
            onChange={alterar('senha')}
          />
        </Campo>
        <Campo rotulo="Confirmar senha" erro={campos.senha_confirmacao}>
          <input
            type="password"
            autoComplete="new-password"
            required
            className={css.controle}
            value={valores.senha_confirmacao}
            onChange={alterar('senha_confirmacao')}
          />
        </Campo>
        {erroGeral && (
          <p role="alert" className={css.erroGeral}>
            {erroGeral}
          </p>
        )}
        <button type="submit" className={css.botao} disabled={mutation.isPending}>
          Cadastrar
        </button>
        <p className={css.apoio}>
          Já tem conta? <Link to="/entrar" className={css.link}>Entrar</Link>
        </p>
      </form>
    </main>
  )
}

function mensagemDoErro(erro: Error): string {
  return erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.'
}
