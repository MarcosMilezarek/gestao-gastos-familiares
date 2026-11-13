import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/cliente'
import { atualizarPerfil } from '../../api/perfil'
import { Campo } from '../../componentes/Campo'
import { useSessao } from '../../hooks/useSessao'
import { useTema, type Tema } from '../../tema/TemaProvider'
import css from './configuracoes.module.css'

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
    <div className={css.pagina}>
      <h1 className={css.titulo}>Perfil e tema</h1>

      <form ref={formRef} className={css.secao} onSubmit={enviarNome}>
        <Campo rotulo="Nome" erro={erroNome}>
          <input
            className={css.entrada}
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            autoComplete="name"
            required
          />
        </Campo>
        {salvarNome.isSuccess && (
          <p className={css.status} role="status">
            Nome salvo.
          </p>
        )}
        <button type="submit" className={css.botao} disabled={salvarNome.isPending}>
          Salvar nome
        </button>
      </form>

      <fieldset className={css.secao}>
        <legend className={css.legenda}>Tema</legend>
        <div className={css.opcoes}>
          {TEMAS.map((opcao) => (
            <button
              key={opcao.valor}
              type="button"
              className={css.opcao}
              aria-pressed={tema === opcao.valor}
              onClick={() => escolherTema(opcao.valor)}
            >
              {opcao.rotulo}
            </button>
          ))}
        </div>
        {trocarTema.error && (
          <p className={css.aviso} role="alert">
            {trocarTema.error.message}
          </p>
        )}
      </fieldset>
    </div>
  )
}
