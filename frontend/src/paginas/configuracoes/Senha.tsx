import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ApiError } from '../../api/cliente'
import { alterarSenha } from '../../api/perfil'
import { Campo } from '../../componentes/Campo'
import css from './configuracoes.module.css'

export function Senha() {
  const [senhaAtual, setSenhaAtual] = useState('')
  const [senhaNova, setSenhaNova] = useState('')
  const formRef = useRef<HTMLFormElement>(null)

  const alterar = useMutation({
    mutationFn: () => alterarSenha({ senha_atual: senhaAtual, senha_nova: senhaNova }),
    onSuccess: () => {
      setSenhaAtual('')
      setSenhaNova('')
    },
  })

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    alterar.mutate()
  }

  const erro = alterar.error instanceof ApiError ? alterar.error : null
  const erroSenhaAtual =
    erro?.campos?.senha_atual ??
    (erro?.codigo === 'SENHA_ATUAL_INCORRETA' ? erro.mensagem : undefined)
  const erroSenhaNova = erro?.campos?.senha_nova
  const erroGeral = erroSenhaAtual || erroSenhaNova ? undefined : alterar.error?.message

  // Foco no primeiro campo com erro (ordem do formulário).
  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus()
  }, [alterar.error])

  return (
    <div className={css.pagina}>
      <h1 className={css.titulo}>Alterar senha</h1>

      <form ref={formRef} className={css.secao} onSubmit={enviar}>
        <Campo rotulo="Senha atual" erro={erroSenhaAtual}>
          <input
            className={css.entrada}
            type="password"
            value={senhaAtual}
            onChange={(evento) => setSenhaAtual(evento.target.value)}
            autoComplete="current-password"
            required
          />
        </Campo>

        <Campo rotulo="Nova senha" ajuda="Mínimo 8 caracteres." erro={erroSenhaNova}>
          <input
            className={css.entrada}
            type="password"
            value={senhaNova}
            onChange={(evento) => setSenhaNova(evento.target.value)}
            autoComplete="new-password"
            required
          />
        </Campo>

        {erroGeral && (
          <p className={css.aviso} role="alert">
            {erroGeral}
          </p>
        )}
        {alterar.isSuccess && (
          <p className={css.status} role="status">
            Senha alterada.
          </p>
        )}
        <button type="submit" className={css.botao} disabled={alterar.isPending}>
          Alterar senha
        </button>
      </form>
    </div>
  )
}
