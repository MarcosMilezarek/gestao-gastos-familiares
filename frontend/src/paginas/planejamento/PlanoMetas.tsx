import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { listarMetas, type MetaSaida } from '../../api/metas'
import { calcularPlano } from '../../api/planoMetas'
import { Campo } from '../../componentes/Campo'
import { Dinheiro } from '../../componentes/Dinheiro'
import estado from '../../componentes/estado.module.css'
import { eZero, mascararEntrada, paraApi } from '../../formatacao/dinheiro'
import css from '../../formularios/formularios.module.css'
import styles from './planejamento.module.css'

// Valor da API ("1234.50") -> texto mascarado ("1.234,50"), sem passar por number.
// Igual ao de FormMeta.tsx (a consolidação fica para uma tarefa própria).
function paraCampo(valor: string): string {
  const [inteiro = '0', centavos = ''] = valor.split('.')
  return mascararEntrada(inteiro + centavos.padEnd(2, '0'))
}

function mensagemErro(erro: unknown): string {
  return erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.'
}

// Plano de metas (RF-7.13, fatia-7.md §3.3). Só cálculo: nada é salvo, nada vai na URL
// nem no localStorage, e reabrir a tela começa vazia.
export function PlanoMetas() {
  const [metaId, setMetaId] = useState('')
  const [valorAlvo, setValorAlvo] = useState('')
  const [valorAtual, setValorAtual] = useState('0,00')
  const [mesAlvo, setMesAlvo] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [aviso, setAviso] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const metas = useQuery({
    queryKey: ['metas'],
    queryFn: listarMetas,
    retry: repetirSem4xx,
  })

  // Foco no primeiro controle marcado como inválido, na ordem da tela.
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [erros])

  const calcular = useMutation({
    mutationFn: () =>
      calcularPlano({
        valor_alvo: paraApi(valorAlvo),
        valor_atual: paraApi(valorAtual),
        mes_alvo: mesAlvo,
      }),
    onError: (erro) => {
      setErros(erro instanceof ApiError ? (erro.campos ?? {}) : {})
      setAviso(mensagemErro(erro))
    },
  })

  // Mudar um campo ou a meta invalida o resultado na tela: ele só vale para os valores calculados.
  function mudarCampo() {
    calcular.reset()
    setAviso(null)
  }

  // Escolher uma meta preenche alvo, atual e mês-alvo (se a meta tiver data); tudo continua editável.
  function escolherMeta(id: string) {
    mudarCampo()
    setMetaId(id)
    const meta: MetaSaida | undefined = metas.data?.metas.find((m) => String(m.id) === id)
    if (!meta) return
    setValorAlvo(paraCampo(meta.valor_alvo))
    setValorAtual(paraCampo(meta.valor_atual))
    if (meta.data_alvo) setMesAlvo(meta.data_alvo.slice(0, 7))
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setAviso(null)
    const falhas: Record<string, string> = {}
    if (valorAlvo === '' || eZero(paraApi(valorAlvo))) {
      falhas.valor_alvo = 'Informe um valor-alvo maior que zero.'
    }
    if (mesAlvo === '') falhas.mes_alvo = 'Informe o mês-alvo.'
    setErros(falhas)
    if (Object.keys(falhas).length > 0) return
    calcular.mutate()
  }

  const resultado = calcular.data

  return (
    <div className={styles.pagina}>
      <header className={styles.topo}>
        <h1 className={styles.titulo}>Plano de metas</h1>
      </header>

      <p className={styles.aviso}>Este plano não é salvo: é só um cálculo.</p>

      {metas.isError && (
        <p role="alert" className={css.erro}>
          {mensagemErro(metas.error)}
        </p>
      )}
      {aviso && (
        <p role="alert" className={css.erro}>
          {aviso}
        </p>
      )}

      <form ref={formRef} className={css.campos} onSubmit={enviar}>
        {metas.data && metas.data.metas.length > 0 && (
          <Campo rotulo="Meta (opcional)">
            <select
              className={css.controle}
              value={metaId}
              onChange={(evento) => escolherMeta(evento.target.value)}
            >
              <option value="">Sem meta: digitar valores</option>
              {metas.data.metas.map((meta) => (
                <option key={meta.id} value={String(meta.id)}>
                  {meta.nome}
                </option>
              ))}
            </select>
          </Campo>
        )}

        <Campo rotulo="Valor-alvo" erro={erros.valor_alvo}>
          <input
            className={css.controle}
            type="text"
            inputMode="numeric"
            placeholder="0,00"
            value={valorAlvo}
            onChange={(evento) => {
              setValorAlvo(mascararEntrada(evento.target.value))
              mudarCampo()
            }}
          />
        </Campo>

        <Campo rotulo="Valor atual" erro={erros.valor_atual}>
          <input
            className={css.controle}
            type="text"
            inputMode="numeric"
            value={valorAtual}
            onChange={(evento) => {
              setValorAtual(mascararEntrada(evento.target.value))
              mudarCampo()
            }}
          />
        </Campo>

        <Campo rotulo="Mês-alvo" erro={erros.mes_alvo}>
          <input
            className={css.controle}
            type="month"
            value={mesAlvo}
            onChange={(evento) => {
              setMesAlvo(evento.target.value)
              mudarCampo()
            }}
          />
        </Campo>

        <button type="submit" className={estado.acao} disabled={calcular.isPending}>
          Calcular
        </button>
      </form>

      {resultado && (
        <section className={styles.resultado} aria-live="polite">
          <h2 className={styles.subtitulo}>Resultado</h2>
          {resultado.atingida ? (
            <p className={styles.atingida}>Meta já atingida.</p>
          ) : (
            <dl className={styles.lista}>
              <div>
                <dt>Meses</dt>
                <dd>{resultado.meses}</dd>
              </div>
              <div>
                <dt>Aplicação mensal</dt>
                <dd>
                  <Dinheiro valor={resultado.aplicacao_mensal} />
                </dd>
              </div>
              <div>
                <dt>Total a aplicar</dt>
                <dd>
                  <Dinheiro valor={resultado.total_a_aplicar} />
                </dd>
              </div>
            </dl>
          )}
        </section>
      )}
    </div>
  )
}
