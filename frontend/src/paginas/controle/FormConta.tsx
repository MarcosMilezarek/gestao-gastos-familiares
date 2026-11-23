import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/cliente'
import {
  arquivarConta,
  editarConta,
  reajustarConta,
  type ContaSaida,
  type TipoConta,
} from '../../api/contas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { BottomSheet } from '../../componentes/BottomSheet'
import { Campo } from '../../componentes/Campo'
import { DialogoConfirmacao } from '../../componentes/DialogoConfirmacao'
import { Dinheiro } from '../../componentes/Dinheiro'
import { SeletorCor } from '../../componentes/SeletorCor'
import { formatarBRL, mascararEntrada, paraApi } from '../../formatacao/dinheiro'

const TIPOS: { valor: TipoConta; rotulo: string }[] = [
  { valor: 'conta_corrente', rotulo: 'Conta corrente' },
  { valor: 'dinheiro', rotulo: 'Dinheiro' },
  { valor: 'poupanca', rotulo: 'Poupança' },
  { valor: 'investimentos', rotulo: 'Investimentos' },
  { valor: 'vr_va', rotulo: 'VR/VA' },
  { valor: 'outros', rotulo: 'Outros' },
]

// Valor da API ("-1234.50") -> texto do campo ("-1.234,50").
export function paraTexto(valor: string): string {
  return formatarBRL(valor).replace('R$ ', '')
}

// Texto do campo ("-1.234,50") -> valor da API ("-1234.50"); o sinal fica na frente.
export function paraValorApi(texto: string): string {
  const valor = paraApi(texto.replace('-', ''))
  return texto.startsWith('-') ? `-${valor}` : valor
}

// Digitação: só dígitos entram (mascararEntrada); o sinal, se houver, fica na frente.
function digitarValor(texto: string): string {
  return (texto.startsWith('-') ? '-' : '') + mascararEntrada(texto)
}

function alternarSinal(texto: string): string {
  return texto.startsWith('-') ? texto.slice(1) : `-${texto}`
}

type FormContaProps = {
  conta: ContaSaida
  aoFechar(): void
}

// Edição de conta ativa: dados, saldo inicial, reajuste de saldo e arquivar (fatia-2.md §5.3, 2.F4).
export function FormConta({ conta, aoFechar }: FormContaProps) {
  const queryClient = useQueryClient()
  const [nome, setNome] = useState(conta.nome)
  const [instituicao, setInstituicao] = useState(conta.instituicao ?? '')
  const [tipo, setTipo] = useState<TipoConta>(conta.tipo)
  const [cor, setCor] = useState(conta.cor)
  const [saldoInicial, setSaldoInicial] = useState(paraTexto(conta.saldo_inicial))
  const [saldoReal, setSaldoReal] = useState(paraTexto(conta.saldo_atual))
  const [confirmandoArquivar, setConfirmandoArquivar] = useState(false)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [aviso, setAviso] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const corpoRef = useRef<HTMLDivElement>(null)

  // Foco no primeiro controle marcado como inválido, na ordem da tela.
  useEffect(() => {
    corpoRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [erros])

  const aoTerminar = () => queryClient.invalidateQueries()

  function limparMensagens() {
    setErros({})
    setAviso(null)
    setStatus(null)
  }

  function tratarErro(erro: unknown) {
    const campos: Record<string, string> = erro instanceof ApiError ? (erro.campos ?? {}) : {}
    setErros(campos)
    setAviso(erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.')
    setStatus(null)
  }

  const salvar = useMutation({
    mutationFn: () =>
      editarConta(conta.id, {
        nome: nome.trim(),
        instituicao: instituicao.trim() || null,
        tipo,
        cor,
        saldo_inicial: paraValorApi(saldoInicial),
      }),
    onSuccess: () => {
      aoTerminar()
      aoFechar()
    },
    onError: tratarErro,
  })

  const reajustar = useMutation({
    mutationFn: () => reajustarConta(conta.id, { saldo_real: paraValorApi(saldoReal) }),
    onSuccess: (retorno) => {
      aoTerminar()
      if (retorno.lancamento === null) {
        // Saldo já igual ao informado: nada foi lançado, o formulário fica aberto.
        limparMensagens()
        setStatus('O saldo já estava igual ao informado. Nenhum lançamento foi criado.')
        return
      }
      aoFechar()
    },
    onError: tratarErro,
  })

  const arquivar = useMutation({
    mutationFn: () => arquivarConta(conta.id),
    onSuccess: () => {
      aoTerminar()
      aoFechar()
    },
    onError: (erro) => {
      setConfirmandoArquivar(false)
      tratarErro(erro)
    },
  })

  function enviarEdicao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    limparMensagens()
    if (nome.trim() === '') {
      setErros({ nome: 'Informe o nome da conta.' })
      return
    }
    salvar.mutate()
  }

  function enviarReajuste() {
    limparMensagens()
    reajustar.mutate()
  }

  return (
    <>
      <BottomSheet
        titulo="Editar conta"
        // Com o diálogo de arquivar aberto, Esc deve fechar só o diálogo: os dois sheets ouvem o teclado.
        aoFechar={confirmandoArquivar ? () => {} : aoFechar}
        rodape={
          <Button type="submit" form="form-conta" className="w-full" disabled={salvar.isPending}>
            Salvar
          </Button>
        }
      >
        <div ref={corpoRef} className="flex flex-col gap-5">
          {aviso && (
            <p role="alert" className="text-14 text-saida-texto">
              {aviso}
            </p>
          )}

          <form id="form-conta" className="flex flex-col gap-4" onSubmit={enviarEdicao}>
            <Campo rotulo="Nome" erro={erros.nome}>
              <Input
                id="conta-nome"
                value={nome}
                onChange={(evento) => setNome(evento.target.value)}
                autoComplete="off"
              />
            </Campo>
            <Campo rotulo="Instituição" erro={erros.instituicao}>
              <Input
                id="conta-instituicao"
                value={instituicao}
                onChange={(evento) => setInstituicao(evento.target.value)}
                autoComplete="off"
              />
            </Campo>
            <Campo rotulo="Tipo" erro={erros.tipo}>
              <Select
                id="conta-tipo"
                value={tipo}
                onChange={(evento) => setTipo(evento.target.value as TipoConta)}
              >
                {TIPOS.map((opcao) => (
                  <option key={opcao.valor} value={opcao.valor}>
                    {opcao.rotulo}
                  </option>
                ))}
              </Select>
            </Campo>
            <SeletorCor valor={cor} onChange={setCor} />
            <CampoValor
              id="conta-saldo-inicial"
              rotulo="Saldo inicial"
              texto={saldoInicial}
              erro={erros.saldo_inicial}
              aoMudar={setSaldoInicial}
            />
          </form>

          <fieldset className="m-0 flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4">
            <legend className="px-1 text-16 font-semibold">Reajuste de saldo</legend>
            <p className="text-14 text-muted-foreground">
              Saldo atual: <Dinheiro valor={conta.saldo_atual} />
            </p>
            <CampoValor
              id="conta-saldo-real"
              rotulo="Saldo real"
              texto={saldoReal}
              erro={erros.saldo_real}
              aoMudar={setSaldoReal}
            />
            <Button
              type="button"
              variant="outline"
              onClick={enviarReajuste}
              disabled={reajustar.isPending}
            >
              Reajustar saldo
            </Button>
            {status && (
              <p role="status" className="text-14 text-muted-foreground">
                {status}
              </p>
            )}
          </fieldset>

          <Button type="button" variant="ghost" onClick={() => setConfirmandoArquivar(true)}>
            Arquivar conta
          </Button>
        </div>
      </BottomSheet>

      {confirmandoArquivar && (
        <DialogoConfirmacao
          titulo="Arquivar conta"
          texto="A conta sai da lista de contas. Os lançamentos continuam guardados e a conta fica em Contas arquivadas."
          rotuloAcao="Arquivar"
          onConfirmar={() => arquivar.mutate()}
          onCancelar={() => setConfirmandoArquivar(false)}
        />
      )}
    </>
  )
}

type CampoValorProps = {
  id: string
  rotulo: string
  texto: string
  erro?: string
  aoMudar(texto: string): void
}

// Valor em reais com botão para o sinal (o teclado numérico não tem "-").
export function CampoValor({ id, rotulo, texto, erro, aoMudar }: CampoValorProps) {
  const negativo = texto.startsWith('-')
  return (
    <div className="flex flex-col gap-2">
      <Campo rotulo={rotulo} erro={erro}>
        <Input
          id={id}
          inputMode="numeric"
          value={texto}
          onChange={(evento) => aoMudar(digitarValor(evento.target.value))}
        />
      </Campo>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-start aria-pressed:border-primary aria-pressed:bg-primary-suave"
        aria-pressed={negativo}
        onClick={() => aoMudar(alternarSinal(texto))}
      >
        Valor negativo
      </Button>
    </div>
  )
}
