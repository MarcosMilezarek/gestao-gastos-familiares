import { Link, useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/cliente'
import { sair } from '../../api/sessao'
import { removerDadosDoUsuario } from '../../hooks/useSessao'
import css from './configuracoes.module.css'

export function Configuracoes() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  function terminar() {
    removerDadosDoUsuario(queryClient)
    queryClient.resetQueries({ queryKey: ['sessao'] })
    navigate('/entrar', { replace: true })
  }

  const encerrar = useMutation({
    mutationFn: sair,
    onSuccess: terminar,
    // Com a sessão já vencida, o servidor responde 401: o logout segue para o login mesmo assim.
    onError: (erro) => {
      if (erro instanceof ApiError && erro.status === 401) terminar()
    },
  })

  return (
    <div className={css.pagina}>
      <h1 className={css.titulo}>Configurações</h1>
      <Link to="/configuracoes/perfil" className={css.opcao}>
        Perfil e tema
      </Link>
      <Link to="/configuracoes/senha" className={css.opcao}>
        Alterar senha
      </Link>
      <Link to="/configuracoes/vinculo" className={css.opcao}>
        Vínculo do casal
      </Link>
      <button
        type="button"
        className={css.opcao}
        disabled={encerrar.isPending}
        onClick={() => encerrar.mutate()}
      >
        Sair
      </button>
      {encerrar.error && (
        <p className={css.aviso} role="alert">
          {encerrar.error.message}
        </p>
      )}
    </div>
  )
}
