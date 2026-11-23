import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { listarMetas, type MetaSaida } from '../../api/metas'
import { Button } from '@/components/ui/button'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { CardMeta } from '../../componentes/CardMeta'
import { CartaoDestaque } from '../../componentes/CartaoDestaque'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import { FormMeta } from './FormMeta'

type Situacao = MetaSaida['situacao']

const SITUACOES: Situacao[] = ['em_andamento', 'concluida']

const ROTULO_ABA: Record<Situacao, string> = {
  em_andamento: 'Em andamento',
  concluida: 'Concluídas',
}

const FRASE_ABA_VAZIA: Record<Situacao, string> = {
  em_andamento: 'Nenhuma meta em andamento.',
  concluida: 'Nenhuma meta concluída ainda.',
}

function mensagemErro(erro: unknown): string {
  return erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.'
}

export function Metas() {
  const [situacao, setSituacao] = useState<Situacao>('em_andamento')
  const [formAberto, setFormAberto] = useState(false)

  const consulta = useQuery({
    queryKey: ['metas'],
    queryFn: listarMetas,
    retry: repetirSem4xx,
  })
  const dados = consulta.data

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <CabecalhoTela
        titulo="Metas"
        acao={
          <Button size="sm" onClick={() => setFormAberto(true)}>
            Nova meta
          </Button>
        }
      />

      {consulta.isError && (
        <p role="alert" className="text-14 font-medium text-saida-texto">
          {mensagemErro(consulta.error)}
        </p>
      )}
      {!dados && !consulta.isError && <p className="text-14 text-muted-foreground">Carregando…</p>}

      {dados && (
        <>
          <CartaoDestaque rotulo="Patrimônio total" valor={dados.patrimonio_total} chips={[]} />

          {dados.metas.length === 0 ? (
            <EstadoVazio
              frase="Nenhuma meta cadastrada. Crie uma meta para acompanhar um objetivo do casal."
              acaoRotulo="Criar meta"
              onAcao={() => setFormAberto(true)}
            />
          ) : (
            <>
              <div className="flex gap-2">
                {SITUACOES.map((opcao) => (
                  <Button
                    key={opcao}
                    size="sm"
                    variant={situacao === opcao ? 'outline' : 'secondary'}
                    aria-pressed={situacao === opcao}
                    onClick={() => setSituacao(opcao)}
                  >
                    {ROTULO_ABA[opcao]}
                  </Button>
                ))}
              </div>

              {dados.metas.filter((meta) => meta.situacao === situacao).length === 0 ? (
                <EstadoVazio compacto frase={FRASE_ABA_VAZIA[situacao]} />
              ) : (
                <ul className="grid gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
                  {dados.metas
                    .filter((meta) => meta.situacao === situacao)
                    .map((meta) => (
                      <li key={meta.id} className="min-w-0">
                        <CardMeta meta={meta} />
                      </li>
                    ))}
                </ul>
              )}
            </>
          )}
        </>
      )}

      {formAberto && <FormMeta aoFechar={() => setFormAberto(false)} />}
    </div>
  )
}
