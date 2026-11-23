import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ApiError } from '../../api/cliente'
import { alterarSenha } from '../../api/perfil'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { Campo } from '../../componentes/Campo'

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
    <div className="flex flex-col gap-4 p-4">
      <CabecalhoTela titulo="Alterar senha" voltarPara="/configuracoes" />

      <Card>
      <form ref={formRef} className="flex flex-col gap-4" onSubmit={enviar}>
        <Campo rotulo="Senha atual" erro={erroSenhaAtual}>
          <Input
            type="password"
            value={senhaAtual}
            onChange={(evento) => setSenhaAtual(evento.target.value)}
            autoComplete="current-password"
            required
          />
        </Campo>

        <Campo rotulo="Nova senha" ajuda="Mínimo 8 caracteres." erro={erroSenhaNova}>
          <Input
            type="password"
            value={senhaNova}
            onChange={(evento) => setSenhaNova(evento.target.value)}
            autoComplete="new-password"
            required
          />
        </Campo>

        {erroGeral && (
          <p className="text-14 text-saida-texto" role="alert">
            {erroGeral}
          </p>
        )}
        {alterar.isSuccess && (
          <p className="text-14 text-entrada-texto" role="status">
            Senha alterada.
          </p>
        )}
        <Button type="submit" disabled={alterar.isPending} className="w-full">
          Alterar senha
        </Button>
      </form>
      </Card>
    </div>
  )
}
