import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { excluirCenario, listarCenarios, type CenarioResumo } from '../../api/cenarios'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { Dinheiro } from '../../componentes/Dinheiro'
import { DialogoConfirmacao } from '../../componentes/DialogoConfirmacao'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import { FormCenario } from './FormCenario'

// Formulário aberto pelos botões da tela: criar, ou renomear um cenário da lista.
type Formulario = { tipo: 'criar' } | { tipo: 'renomear'; cenario: CenarioResumo }

function mensagemErro(erro: unknown): string {
  return erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.'
}

export function Cenarios() {
  const queryClient = useQueryClient()
  const [formulario, setFormulario] = useState<Formulario | null>(null)
  const [paraExcluir, setParaExcluir] = useState<CenarioResumo | null>(null)

  const consulta = useQuery({
    queryKey: ['cenarios'],
    queryFn: listarCenarios,
    retry: repetirSem4xx,
  })
  const dados = consulta.data

  const excluir = useMutation({
    mutationFn: excluirCenario,
    onSuccess: () => {
      queryClient.invalidateQueries()
      setParaExcluir(null)
    },
    // Erro na exclusão: fecha a confirmação e a mensagem aparece no topo da tela.
    onError: () => setParaExcluir(null),
  })

  return (
    <div className="flex flex-col gap-4 p-4">
      <CabecalhoTela
        titulo="Cenários"
        voltarPara="/planejamento"
        acao={
          <Button variant="ghost" size="sm" onClick={() => setFormulario({ tipo: 'criar' })}>
            Novo cenário
          </Button>
        }
      />

      {consulta.isError && (
        <p role="alert" className="text-14 text-saida-texto">
          {mensagemErro(consulta.error)}
        </p>
      )}
      {excluir.isError && (
        <p role="alert" className="text-14 text-saida-texto">
          {mensagemErro(excluir.error)}
        </p>
      )}
      {!dados && !consulta.isError && <p className="text-muted-foreground">Carregando…</p>}

      {dados && dados.length === 0 && (
        <EstadoVazio
          frase="Nenhum cenário cadastrado. Crie um cenário para simular a renda e as despesas do casal."
          acaoRotulo="Criar cenário"
          onAcao={() => setFormulario({ tipo: 'criar' })}
        />
      )}

      {dados && dados.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {dados.map((cenario) => (
            <li key={cenario.id}>
              <Card className="flex flex-col gap-2 p-4">
                <Link
                  to={`/planejamento/cenarios/${cenario.id}`}
                  className="flex min-h-11 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1 break-words text-16 font-semibold">
                    {cenario.nome}
                  </span>
                  <span className="flex flex-col items-end">
                    <span className="text-13 text-muted-foreground">Saldo mensal</span>
                    <Dinheiro valor={cenario.saldo_mensal} />
                  </span>
                  <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                </Link>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFormulario({ tipo: 'renomear', cenario })}
                  >
                    Renomear
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setParaExcluir(cenario)}>
                    Excluir
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {formulario && (
        <FormCenario
          cenario={formulario.tipo === 'renomear' ? formulario.cenario : undefined}
          aoFechar={() => setFormulario(null)}
        />
      )}

      {paraExcluir && (
        <DialogoConfirmacao
          titulo="Excluir cenário"
          texto={`O cenário "${paraExcluir.nome}" e os seus itens serão apagados.`}
          rotuloAcao="Excluir"
          destrutivo
          onConfirmar={() => excluir.mutate(paraExcluir.id)}
          onCancelar={() => setParaExcluir(null)}
        />
      )}
    </div>
  )
}
