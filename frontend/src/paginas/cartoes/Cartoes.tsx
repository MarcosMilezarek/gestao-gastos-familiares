import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { listarCartoes } from '../../api/cartoes'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { CardCartao } from '../../componentes/CardCartao'
import { CardResumo, CardsResumo } from '../../componentes/CardsResumo'
import { EstadoVazio } from '../../componentes/EstadoVazio'

function mensagemErro(erro: unknown): string {
  return erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.'
}

export function Cartoes() {
  const navigate = useNavigate()
  const [arquivadasAbertas, setArquivadasAbertas] = useState(false)

  const consulta = useQuery({
    queryKey: ['cartoes', { arquivadas: false }],
    queryFn: () => listarCartoes({ arquivadas: false }),
    retry: repetirSem4xx,
  })
  const dados = consulta.data

  // Cartões de conta arquivada só são buscados ao abrir a seção.
  const consultaArquivadas = useQuery({
    queryKey: ['cartoes', { arquivadas: true }],
    queryFn: () => listarCartoes({ arquivadas: true }),
    enabled: arquivadasAbertas,
    retry: repetirSem4xx,
  })
  const arquivados = consultaArquivadas.data

  return (
    <div className="flex flex-col gap-4 p-4">
      <CabecalhoTela
        titulo="Cartões"
        acao={
          <Button asChild size="sm">
            <Link to="/cartoes/novo">Novo cartão</Link>
          </Button>
        }
      />

      {consulta.isError && (
        <p role="alert" className="text-14 text-saida-texto">
          {mensagemErro(consulta.error)}
        </p>
      )}
      {!dados && !consulta.isError && <p className="text-14 text-muted-foreground">Carregando…</p>}

      {dados && (
        <>
          <CardsResumo>
            {dados.limite_disponivel_total !== null && (
              <CardResumo rotulo="Limite disponível" valor={dados.limite_disponivel_total} />
            )}
            {dados.total_faturas_mes !== null && (
              <CardResumo rotulo="Faturas do mês" valor={dados.total_faturas_mes} />
            )}
          </CardsResumo>

          {dados.cartoes.length === 0 ? (
            <EstadoVazio
              frase="Nenhum cartão cadastrado."
              acaoRotulo="Cadastrar cartão"
              onAcao={() => navigate('/cartoes/novo')}
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {dados.cartoes.map((cartao) => (
                <li key={cartao.id}>
                  <CardCartao cartao={cartao} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <section className="flex flex-col gap-3">
        <Button
          type="button"
          variant="ghost"
          className="justify-between"
          aria-expanded={arquivadasAbertas}
          aria-controls="cartoes-arquivadas"
          onClick={() => setArquivadasAbertas((aberta) => !aberta)}
        >
          Contas arquivadas
          <ChevronDown
            aria-hidden="true"
            className={arquivadasAbertas ? 'rotate-180 transition-transform' : 'transition-transform'}
          />
        </Button>

        {arquivadasAbertas && (
          <div id="cartoes-arquivadas" className="flex flex-col gap-3">
            {consultaArquivadas.isError && (
              <p role="alert" className="text-14 text-saida-texto">
                {mensagemErro(consultaArquivadas.error)}
              </p>
            )}
            {!arquivados && !consultaArquivadas.isError && (
              <p className="text-14 text-muted-foreground">Carregando…</p>
            )}
            {arquivados &&
              (arquivados.cartoes.length === 0 ? (
                <p className="text-14 text-muted-foreground">Nenhum cartão em contas arquivadas.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {arquivados.cartoes.map((cartao) => (
                    <li key={cartao.id}>
                      <CardCartao cartao={cartao} />
                    </li>
                  ))}
                </ul>
              ))}
          </div>
        )}
      </section>
    </div>
  )
}
