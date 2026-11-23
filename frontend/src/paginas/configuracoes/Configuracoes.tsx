import { ChevronRight, KeyRound, LogOut, UserRound, UsersRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/cliente'
import { sair } from '../../api/sessao'
import { Card } from '@/components/ui/card'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { IconeQuadrado } from '../../componentes/IconeQuadrado'
import { removerDadosDoUsuario } from '../../hooks/useSessao'

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
    <div className="flex flex-col gap-4">
      <CabecalhoTela titulo="Configurações" voltarPara="/" />
      <Card className="gap-0 p-0">
        <Link to="/configuracoes/perfil" className={linha}>
          <IconeQuadrado icone={UserRound} />
          <span className="flex-1">Perfil e tema</span>
          <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
        </Link>
        <Link to="/configuracoes/senha" className={linha}>
          <IconeQuadrado icone={KeyRound} />
          <span className="flex-1">Alterar senha</span>
          <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
        </Link>
        <Link to="/configuracoes/vinculo" className={linha}>
          <IconeQuadrado icone={UsersRound} />
          <span className="flex-1">Vínculo do casal</span>
          <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
        </Link>
        <button
          type="button"
          className={linha}
          disabled={encerrar.isPending}
          onClick={() => encerrar.mutate()}
        >
          <IconeQuadrado icone={LogOut} tom="saida" />
          <span className="flex-1">Sair</span>
        </button>
      </Card>
      {encerrar.error && (
        <p className="text-14 text-saida-texto" role="alert">
          {encerrar.error.message}
        </p>
      )}
    </div>
  )
}

const linha =
  'flex min-h-14 w-full items-center gap-3 border-b px-4 py-2 text-left text-16 font-medium outline-none last:border-b-0 focus-visible:ring-2 focus-visible:ring-ring disabled:text-disabled-foreground'
