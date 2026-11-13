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
import { Campo } from '../../componentes/Campo'
import { DialogoConfirmacao } from '../../componentes/DialogoConfirmacao'
import styles from './vinculo.module.css'

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
      <div className={styles.pagina}>
        <h1 className={styles.titulo}>Vínculo do casal</h1>
        {consulta.isError ? (
          <p role="alert" className={styles.erro}>
            {consulta.error instanceof ApiError
              ? consulta.error.mensagem
              : 'Erro inesperado. Tente novamente.'}
          </p>
        ) : (
          <p className={styles.texto}>Carregando…</p>
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
    <div className={styles.pagina}>
      <h1 className={styles.titulo}>Vínculo do casal</h1>

      {erroGeral && (
        <p role="alert" className={styles.erro}>
          {erroGeral instanceof ApiError ? erroGeral.mensagem : 'Erro inesperado. Tente novamente.'}
        </p>
      )}

      {dados.estado === 'sem_vinculo' && (
        <section className={styles.bloco}>
          <form ref={formRef} className={styles.formulario} onSubmit={aoEnviarConvite}>
            <Campo rotulo="E-mail do parceiro(a)" erro={campoEmail}>
              <input
                type="email"
                required
                autoComplete="email"
                className={styles.entrada}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Campo>
            <div className={styles.acoes}>
              <button type="submit" className={styles.botao} disabled={enviarConvite.isPending}>
                Enviar convite
              </button>
            </div>
          </form>
        </section>
      )}

      {enviado && (
        <section className={styles.bloco}>
          <p className={styles.texto}>Convite enviado para {enviado.email_convidado}</p>
          <div className={styles.acoes}>
            <button
              type="button"
              className={styles.botao}
              disabled={cancelar.isPending}
              onClick={() => cancelar.mutate(enviado.id)}
            >
              Cancelar convite
            </button>
          </div>
        </section>
      )}

      {dados.convites_recebidos.map((convite) => (
        <section key={convite.id} className={styles.bloco}>
          <p className={styles.texto}>{convite.convidante_nome} convidou você</p>
          <div className={styles.acoes}>
            <button
              type="button"
              className={styles.botao}
              disabled={aceitar.isPending || recusar.isPending}
              onClick={() => aceitar.mutate(convite.id)}
            >
              Aceitar
            </button>
            <button
              type="button"
              className={styles.botao}
              disabled={aceitar.isPending || recusar.isPending}
              onClick={() => recusar.mutate(convite.id)}
            >
              Recusar
            </button>
          </div>
        </section>
      ))}

      {dados.parceiro && (
        <section className={styles.bloco}>
          <p className={styles.texto}>Vinculado(a) com {dados.parceiro.nome}</p>
          <div className={styles.acoes}>
            <button
              type="button"
              className={styles.botao}
              onClick={() => setConfirmandoDesvinculo(true)}
            >
              Desvincular
            </button>
          </div>
        </section>
      )}

      {confirmandoDesvinculo && (
        <DialogoConfirmacao
          titulo="Desvincular do casal?"
          texto="A conta conjunta será arquivada, e vocês deixam de ver os dados um do outro."
          rotuloAcao="Desvincular"
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
