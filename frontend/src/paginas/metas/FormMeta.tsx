import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/cliente'
import { criarMeta, editarMeta, type MetaSaida } from '../../api/metas'
import { BottomSheet } from '../../componentes/BottomSheet'
import { Campo } from '../../componentes/Campo'
import estado from '../../componentes/estado.module.css'
import { SeletorCor } from '../../componentes/SeletorCor'
import { SeletorIcone } from '../../componentes/SeletorIcone'
import { eZero, mascararEntrada, paraApi } from '../../formatacao/dinheiro'
import css from '../../formularios/formularios.module.css'
import { SeletorModelo } from './SeletorModelo'
import type { ModeloMeta } from './modelosMeta'

// Ícone de quem cria sem escolher: "Alvo" (o do modelo "Personalizado").
const ICONE_INICIAL = 'target'

type FormMetaProps = {
  // Sem meta: criação (com SeletorModelo). Com meta: edição.
  meta?: MetaSaida
  aoFechar(): void
}

// Valor da API ("1234.50") -> texto mascarado ("1.234,50"), sem passar por number.
function paraCampo(valor: string): string {
  const [inteiro = '0', centavos = ''] = valor.split('.')
  return mascararEntrada(inteiro + centavos.padEnd(2, '0'))
}

// Criar ou editar meta (fatia-6.md §5.1, 6.F4). Erros de campo vêm de ApiError.campos; os demais (SEM_VINCULO, META_FICARIA_NEGATIVA) aparecem na mensagem do topo.
export function FormMeta({ meta, aoFechar }: FormMetaProps) {
  const queryClient = useQueryClient()
  const [nome, setNome] = useState(meta?.nome ?? '')
  const [valorAlvo, setValorAlvo] = useState(meta ? paraCampo(meta.valor_alvo) : '')
  const [dataAlvo, setDataAlvo] = useState(meta?.data_alvo ?? '')
  const [valorInicial, setValorInicial] = useState(meta ? paraCampo(meta.valor_inicial) : '0,00')
  const [cor, setCor] = useState(meta?.cor ?? '')
  const [icone, setIcone] = useState(meta?.icone ?? ICONE_INICIAL)
  const [descricao, setDescricao] = useState(meta?.descricao ?? '')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [aviso, setAviso] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Foco no primeiro controle marcado como inválido, na ordem da tela (erro do cliente ou da API).
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [erros])

  const salvar = useMutation({
    mutationFn: () => {
      const corpo = {
        nome: nome.trim(),
        valor_alvo: paraApi(valorAlvo),
        valor_inicial: paraApi(valorInicial),
        cor,
        icone,
      }
      const descricaoLimpa = descricao.trim()
      if (meta) {
        // Na edição, campo vazio remove o valor (data_alvo: null, descricao: null).
        return editarMeta(meta.id, {
          ...corpo,
          data_alvo: dataAlvo === '' ? null : dataAlvo,
          descricao: descricaoLimpa === '' ? null : descricaoLimpa,
        })
      }
      return criarMeta({
        ...corpo,
        ...(dataAlvo === '' ? {} : { data_alvo: dataAlvo }),
        ...(descricaoLimpa === '' ? {} : { descricao: descricaoLimpa }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries()
      aoFechar()
    },
    onError: (erro) => {
      setErros(erro instanceof ApiError ? (erro.campos ?? {}) : {})
      setAviso(erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.')
    },
  })

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setAviso(null)
    const falhas: Record<string, string> = {}
    if (nome.trim() === '') falhas.nome = 'Informe o nome da meta.'
    if (valorAlvo === '' || eZero(paraApi(valorAlvo))) {
      falhas.valor_alvo = 'Informe um valor-alvo maior que zero.'
    }
    if (cor === '') falhas.cor = 'Informe a cor da meta.'
    setErros(falhas)
    if (Object.keys(falhas).length > 0) return
    salvar.mutate()
  }

  // Escolher um modelo preenche nome, ícone e cor; tudo continua editável. "Personalizado" não tem nome: o digitado fica.
  function aplicarModelo(modelo: ModeloMeta) {
    if (modelo.nome !== null) setNome(modelo.nome)
    setIcone(modelo.icone)
    setCor(modelo.cor)
  }

  return (
    <BottomSheet
      titulo={meta ? 'Editar meta' : 'Nova meta'}
      aoFechar={aoFechar}
      rodape={
        <button
          type="submit"
          form="form-meta"
          className={estado.acao}
          disabled={salvar.isPending}
        >
          Salvar
        </button>
      }
    >
      {aviso && (
        <p role="alert" className={css.erro}>
          {aviso}
        </p>
      )}

      <form ref={formRef} id="form-meta" className={css.campos} onSubmit={enviar}>
        {!meta && <SeletorModelo aoEscolher={aplicarModelo} />}

        <Campo rotulo="Nome" erro={erros.nome}>
          <input
            className={css.controle}
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            autoComplete="off"
          />
        </Campo>

        <Campo rotulo="Valor-alvo" erro={erros.valor_alvo}>
          <input
            className={css.controle}
            type="text"
            inputMode="numeric"
            placeholder="0,00"
            value={valorAlvo}
            onChange={(evento) => setValorAlvo(mascararEntrada(evento.target.value))}
          />
        </Campo>

        <Campo rotulo="Data-alvo (opcional)" erro={erros.data_alvo}>
          <input
            className={css.controle}
            type="date"
            value={dataAlvo}
            onChange={(evento) => setDataAlvo(evento.target.value)}
          />
        </Campo>

        <Campo rotulo="Valor inicial" erro={erros.valor_inicial}>
          <input
            className={css.controle}
            type="text"
            inputMode="numeric"
            value={valorInicial}
            onChange={(evento) => setValorInicial(mascararEntrada(evento.target.value))}
          />
        </Campo>

        <div tabIndex={-1} aria-invalid={erros.cor ? true : undefined}>
          <SeletorCor valor={cor} onChange={setCor} />
        </div>
        {erros.cor && (
          <p role="alert" className={css.erro}>
            {erros.cor}
          </p>
        )}

        <div tabIndex={-1} aria-invalid={erros.icone ? true : undefined}>
          <SeletorIcone valor={icone} onChange={setIcone} />
        </div>
        {erros.icone && (
          <p role="alert" className={css.erro}>
            {erros.icone}
          </p>
        )}

        <Campo rotulo="Descrição (opcional)" erro={erros.descricao}>
          <textarea
            className={css.controle}
            value={descricao}
            onChange={(evento) => setDescricao(evento.target.value)}
          />
        </Campo>
      </form>
    </BottomSheet>
  )
}
