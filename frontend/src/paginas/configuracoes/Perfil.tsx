import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/cliente'
import { atualizarPerfil } from '../../api/perfil'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { Campo } from '../../componentes/Campo'
import { useSessao } from '../../hooks/useSessao'
import { Check } from 'lucide-react'
import { useTema, type Tema } from '../../tema/TemaProvider'

const TEMAS: { valor: Tema; rotulo: string }[] = [
  { valor: 'claro', rotulo: 'Claro' },
  { valor: 'escuro', rotulo: 'Escuro' },
]

export function Perfil() {
  const { data } = useSessao()
  if (!data) return null
  return <PerfilFormulario nomeInicial={data.usuario.nome} />
}

function PerfilFormulario({ nomeInicial }: { nomeInicial: string }) {
  const queryClient = useQueryClient()
  const { tema, aplicar } = useTema()
  const formRef = useRef<HTMLFormElement>(null)
  const [nome, setNome] = useState(nomeInicial)

  const invalidarSessao = () => queryClient.invalidateQueries({ queryKey: ['sessao'] })

  const salvarNome = useMutation({
    mutationFn: (novo: string) => atualizarPerfil({ nome: novo }),
    onSuccess: invalidarSessao,
  })

  const trocarTema = useMutation({
    mutationFn: (novo: Tema) => atualizarPerfil({ tema: novo }),
    onSuccess: invalidarSessao,
  })

  // Aplica na hora; se o servidor recusar, volta ao tema anterior.
  function escolherTema(novo: Tema) {
    const anterior = tema
    aplicar(novo)
    trocarTema.mutate(novo, { onError: () => aplicar(anterior) })
  }

  function enviarNome(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    salvarNome.mutate(nome.trim())
  }

  const erroNome =
    (salvarNome.error instanceof ApiError ? salvarNome.error.campos?.nome : undefined) ??
    salvarNome.error?.message

  // Foco no primeiro campo com erro (ordem do formulário).
  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus()
  }, [salvarNome.error])

  return (
    <div className="flex flex-col gap-4">
      <CabecalhoTela titulo="Perfil e tema" voltarPara="/configuracoes" />

      <Card>
        <form ref={formRef} className="flex flex-col gap-4" onSubmit={enviarNome}>
          <Campo rotulo="Nome" erro={erroNome}>
            <Input
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              autoComplete="name"
              required
            />
          </Campo>
          {salvarNome.isSuccess && (
            <p className="text-14 text-entrada-texto" role="status">
              Nome salvo.
            </p>
          )}
          <Button type="submit" disabled={salvarNome.isPending} className="w-full">
            Salvar nome
          </Button>
        </form>
      </Card>

      <Card>
        <fieldset className="flex min-w-0 flex-col gap-4">
          <legend className="text-16 font-semibold">Tema</legend>
          <div className="flex gap-2">
            {TEMAS.map((opcao) => (
              <Button
                key={opcao.valor}
                type="button"
                variant={tema === opcao.valor ? 'default' : 'secondary'}
                size="sm"
                aria-pressed={tema === opcao.valor}
                onClick={() => escolherTema(opcao.valor)}
              >
                {tema === opcao.valor && <Check aria-hidden="true" />}
                {opcao.rotulo}
              </Button>
            ))}
          </div>
          {trocarTema.error && (
            <p className="text-14 text-saida-texto" role="alert">
              {trocarTema.error.message}
            </p>
          )}
        </fieldset>
      </Card>
    </div>
  )
}
