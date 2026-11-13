import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { excluirCenario, listarCenarios, type CenarioResumo } from '../../api/cenarios'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { Dinheiro } from '../../componentes/Dinheiro'
import { DialogoConfirmacao } from '../../componentes/DialogoConfirmacao'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import estado from '../../componentes/estado.module.css'
import { FormCenario } from './FormCenario'
import styles from './cenarios.module.css'

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
    <div className={styles.pagina}>
      <header className={styles.topo}>
        <h1 className={styles.titulo}>Cenários</h1>
        <button
          type="button"
          className={styles.novo}
          onClick={() => setFormulario({ tipo: 'criar' })}
        >
          Novo cenário
        </button>
      </header>

      {consulta.isError && (
        <p role="alert" className={styles.erro}>
          {mensagemErro(consulta.error)}
        </p>
      )}
      {excluir.isError && (
        <p role="alert" className={styles.erro}>
          {mensagemErro(excluir.error)}
        </p>
      )}
      {!dados && !consulta.isError && <p className={styles.aviso}>Carregando…</p>}

      {dados && dados.length === 0 && (
        <EstadoVazio
          frase="Nenhum cenário cadastrado. Crie um cenário para simular a renda e as despesas do casal."
          acaoRotulo="Criar cenário"
          onAcao={() => setFormulario({ tipo: 'criar' })}
        />
      )}

      {dados && dados.length > 0 && (
        <ul className={styles.lista}>
          {dados.map((cenario) => (
            <li key={cenario.id} className={styles.item}>
              <Link to={`/planejamento/cenarios/${cenario.id}`} className={styles.card}>
                <span className={styles.nome}>{cenario.nome}</span>
                <span className={styles.saldo}>
                  <span className={styles.rotulo}>Saldo mensal</span>
                  <Dinheiro valor={cenario.saldo_mensal} />
                </span>
              </Link>
              <div className={styles.acoes}>
                <button
                  type="button"
                  className={estado.acao}
                  onClick={() => setFormulario({ tipo: 'renomear', cenario })}
                >
                  Renomear
                </button>
                <button
                  type="button"
                  className={estado.acao}
                  onClick={() => setParaExcluir(cenario)}
                >
                  Excluir
                </button>
              </div>
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
          onConfirmar={() => excluir.mutate(paraExcluir.id)}
          onCancelar={() => setParaExcluir(null)}
        />
      )}
    </div>
  )
}
