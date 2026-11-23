import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/cliente'
import {
  aceitarConvite,
  cancelarConvite,
  convidar,
  desvincular,
  obterVinculo,
  recusarConvite,
} from '../../api/vinculo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { Campo } from '../../componentes/Campo'
import { DialogoConfirmacao } from '../../componentes/DialogoConfirmacao'

export function Vinculo() {
  const queryClient = useQueryClient()
  const formRef = useRef<HTMLFormElement>(null)
  const [email, setEmail] = useState('')
  const [confirmandoDesvinculo, setConfirmandoDesvinculo] = useState(false)

  const consulta = useQuery({ queryKey: ['vinculo'], queryFn: obterVinculo })

  // Depois de cada ação o estado do casal pode ter mudado: invalida tudo, sem filtro.
  const aoTerminar = () => queryClient.invalidateQueries()

  const enviarConvite = useMutation({
    mutationFn: convidar,
    onSuccess: () => setEmail(''),
    onSettled: aoTerminar,
  })
  const cancelar = useMutation({ mutationFn: cancelarConvite, onSettled: aoTerminar })
  const aceitar = useMutation({ mutationFn: aceitarConvite, onSettled: aoTerminar })
  const recusar = useMutation({ mutationFn: recusarConvite, onSettled: aoTerminar })
  const desvincularCasal = useMutation({
    mutationFn: desvincular,
    onSettled: aoTerminar,
  })

  // Foco no primeiro campo com erro (ordem do formulário).
  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus()
  }, [enviarConvite.error])

  const dados = consulta.data
  if (!dados) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <CabecalhoTela titulo="Vínculo do casal" voltarPara="/configuracoes" />
        {consulta.isError ? (
          <p role="alert" className="text-14 text-saida-texto">
            {consulta.error instanceof ApiError
              ? consulta.error.mensagem
              : 'Erro inesperado. Tente novamente.'}
          </p>
        ) : (
          <p className="text-16">Carregando…</p>
        )}
      </div>
    )
  }

  const enviado = dados.convite_enviado

  // Erro de e-mail vai junto ao campo; os demais, como aviso geral.
  const erroEmail = enviarConvite.error instanceof ApiError ? enviarConvite.error : null
  const campoEmail = erroEmail?.campos?.email
  const erroGeral = [
    enviarConvite.error && !campoEmail ? enviarConvite.error : null,
    cancelar.error,
    aceitar.error,
    recusar.error,
    desvincularCasal.error,
  ].find(Boolean)

  function aoEnviarConvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    enviarConvite.mutate({ email: email.trim() })
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <CabecalhoTela titulo="Vínculo do casal" voltarPara="/configuracoes" />

      {erroGeral && (
        <p role="alert" className="text-14 text-saida-texto">
          {erroGeral instanceof ApiError ? erroGeral.mensagem : 'Erro inesperado. Tente novamente.'}
        </p>
      )}

      {dados.estado === 'sem_vinculo' && (
        <Card>
          <form ref={formRef} className="flex flex-col gap-4" onSubmit={aoEnviarConvite}>
            <Campo rotulo="E-mail do parceiro(a)" erro={campoEmail}>
              <Input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Campo>
            <div className="flex flex-col gap-2">
              <Button type="submit" className="w-full" disabled={enviarConvite.isPending}>
                Enviar convite
              </Button>
            </div>
          </form>
        </Card>
      )}

      {enviado && (
        <Card>
          <p className="text-16">Convite enviado para {enviado.email_convidado}</p>
          <div className="flex flex-col gap-2">
            <Button variant="secondary" className="w-full"
              type="button"
              disabled={cancelar.isPending}
              onClick={() => cancelar.mutate(enviado.id)}
            >
              Cancelar convite
            </Button>
          </div>
        </Card>
      )}

      {dados.convites_recebidos.map((convite) => (
        <Card key={convite.id}>
          <p className="text-16">{convite.convidante_nome} convidou você</p>
          <div className="flex flex-col gap-2">
            <Button className="w-full"
              type="button"
              disabled={aceitar.isPending || recusar.isPending}
              onClick={() => aceitar.mutate(convite.id)}
            >
              Aceitar
            </Button>
            <Button variant="secondary" className="w-full"
              type="button"
              disabled={aceitar.isPending || recusar.isPending}
              onClick={() => recusar.mutate(convite.id)}
            >
              Recusar
            </Button>
          </div>
        </Card>
      ))}

      {dados.parceiro && (
        <Card>
          <p className="text-16">Vinculado(a) com {dados.parceiro.nome}</p>
          <div className="flex flex-col gap-2">
            <Button variant="secondary" className="w-full"
              type="button"
              onClick={() => setConfirmandoDesvinculo(true)}
            >
              Desvincular
            </Button>
          </div>
        </Card>
      )}

      {confirmandoDesvinculo && (
        <DialogoConfirmacao
          titulo="Desvincular do casal?"
          texto="A conta conjunta será arquivada, e vocês deixam de ver os dados um do outro."
          rotuloAcao="Desvincular"
          destrutivo
          onCancelar={() => setConfirmandoDesvinculo(false)}
          onConfirmar={() => {
            setConfirmandoDesvinculo(false)
            desvincularCasal.mutate()
          }}
        />
      )}
    </div>
  )
}
