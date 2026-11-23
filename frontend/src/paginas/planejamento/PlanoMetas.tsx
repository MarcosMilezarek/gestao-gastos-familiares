import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { listarMetas, type MetaSaida } from '../../api/metas'
import { calcularPlano } from '../../api/planoMetas'
import { Campo } from '../../componentes/Campo'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { Dinheiro } from '../../componentes/Dinheiro'
import { TituloBloco } from '../../componentes/TituloBloco'
import { eZero, mascararEntrada, paraApi } from '../../formatacao/dinheiro'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

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
    <div className="flex flex-col gap-4">
      <CabecalhoTela titulo="Plano de metas" voltarPara="/planejamento" />

      <p className="text-14 text-muted-foreground">Este plano não é salvo: é só um cálculo.</p>

      {metas.isError && (
        <p role="alert" className="rounded-lg bg-saida-suave p-3 text-14 text-saida-texto">
          {mensagemErro(metas.error)}
        </p>
      )}
      {aviso && (
        <p role="alert" className="rounded-lg bg-saida-suave p-3 text-14 text-saida-texto">
          {aviso}
        </p>
      )}

      <form ref={formRef} className="flex flex-col gap-4" onSubmit={enviar}>
        {metas.data && metas.data.metas.length > 0 && (
          <Campo rotulo="Meta (opcional)">
            <Select value={metaId} onChange={(evento) => escolherMeta(evento.target.value)}>
              <option value="">Sem meta: digitar valores</option>
              {metas.data.metas.map((meta) => (
                <option key={meta.id} value={String(meta.id)}>
                  {meta.nome}
                </option>
              ))}
            </Select>
          </Campo>
        )}

        <Campo rotulo="Valor-alvo" erro={erros.valor_alvo}>
          <Input
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
          <Input
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
          <Input
            type="month"
            value={mesAlvo}
            onChange={(evento) => {
              setMesAlvo(evento.target.value)
              mudarCampo()
            }}
          />
        </Campo>

        <Button type="submit" disabled={calcular.isPending}>
          Calcular
        </Button>
      </form>

      {resultado && (
        <section aria-live="polite">
          <Card>
            <TituloBloco titulo="Resultado" />
            {resultado.atingida ? (
              <p className="font-semibold">Meta já atingida.</p>
            ) : (
              <dl className="flex flex-col gap-3 tabular-nums">
                <div className="flex items-center justify-between gap-2">
                  <dt>Meses</dt>
                  <dd className="font-semibold">{resultado.meses}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt>Aplicação mensal</dt>
                  <dd>
                    <Dinheiro valor={resultado.aplicacao_mensal} />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt>Total a aplicar</dt>
                  <dd>
                    <Dinheiro valor={resultado.total_a_aplicar} />
                  </dd>
                </div>
              </dl>
            )}
          </Card>
        </section>
      )}
    </div>
  )
}
