import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { criarCartao } from '../../api/cartoes'
import { listarContas } from '../../api/contas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { Campo } from '../../componentes/Campo'
import { mascararEntrada, paraApi } from '../../formatacao/dinheiro'

export type ValoresCartao = {
  nome: string
  limite: string
  diaFechamento: string
  diaVencimento: string
  bandeira: string
}

export type ErrosCartao = Record<string, string>

// Dia do mês: só dígitos, até 2 caracteres (a faixa 1..31 é do servidor).
function apenasDia(texto: string): string {
  return texto.replace(/\D/g, '').slice(0, 2)
}

// Obrigatório e formato mínimo; a regra de negócio é do servidor (front.md §8).
export function validarValores(valores: ValoresCartao): ErrosCartao {
  const erros: ErrosCartao = {}
  if (valores.nome.trim() === '') erros.nome = 'Informe o nome do cartão.'
  if (valores.limite === '') erros.limite = 'Informe o limite.'
  if (valores.diaFechamento === '') erros.dia_fechamento = 'Informe o dia de fechamento.'
  if (valores.diaVencimento === '') erros.dia_vencimento = 'Informe o dia de vencimento.'
  return erros
}

type CamposCartaoProps = {
  valores: ValoresCartao
  erros: ErrosCartao
  aoMudar(parcial: Partial<ValoresCartao>): void
  ajusteDias?: string
}

// Campos próprios do cartão, usados no cadastro e na edição. Conta dona fica fora.
export function CamposCartao({ valores, erros, aoMudar, ajusteDias }: CamposCartaoProps) {
  return (
    <>
      <Campo rotulo="Nome" erro={erros.nome}>
        <Input
          value={valores.nome}
          onChange={(evento) => aoMudar({ nome: evento.target.value })}
          autoComplete="off"
        />
      </Campo>
      <Campo rotulo="Limite" erro={erros.limite}>
        <Input
          inputMode="numeric"
          value={valores.limite}
          onChange={(evento) => aoMudar({ limite: mascararEntrada(evento.target.value) })}
        />
      </Campo>
      <Campo rotulo="Dia de fechamento" erro={erros.dia_fechamento} ajuda={ajusteDias}>
        <Input
          inputMode="numeric"
          value={valores.diaFechamento}
          onChange={(evento) => aoMudar({ diaFechamento: apenasDia(evento.target.value) })}
        />
      </Campo>
      <Campo rotulo="Dia de vencimento" erro={erros.dia_vencimento} ajuda={ajusteDias}>
        <Input
          inputMode="numeric"
          value={valores.diaVencimento}
          onChange={(evento) => aoMudar({ diaVencimento: apenasDia(evento.target.value) })}
        />
      </Campo>
      <Campo rotulo="Bandeira (opcional)" erro={erros.bandeira}>
        <Input
          value={valores.bandeira}
          onChange={(evento) => aoMudar({ bandeira: evento.target.value })}
          autoComplete="off"
        />
      </Campo>
    </>
  )
}

// Cadastro do cartão (`/cartoes/novo`). A conta dona é escolhida entre as contas ativas.
export function CadastroCartao() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [contaId, setContaId] = useState('')
  const [valores, setValores] = useState<ValoresCartao>({
    nome: '',
    limite: '',
    diaFechamento: '',
    diaVencimento: '',
    bandeira: '',
  })
  const [erros, setErros] = useState<ErrosCartao>({})
  const [aviso, setAviso] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const contas = useQuery({
    queryKey: ['contas', 'ativas'],
    queryFn: () => listarContas(),
    retry: repetirSem4xx,
  })

  // Foco no primeiro campo marcado como inválido, na ordem da tela.
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [erros])

  const criar = useMutation({
    mutationFn: () =>
      criarCartao({
        nome: valores.nome.trim(),
        conta_id: Number(contaId),
        limite: paraApi(valores.limite),
        dia_fechamento: Number(valores.diaFechamento),
        dia_vencimento: Number(valores.diaVencimento),
        bandeira: valores.bandeira.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries()
      navigate('/cartoes')
    },
    onError: (erro) => {
      setErros(erro instanceof ApiError ? (erro.campos ?? {}) : {})
      setAviso(erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.')
    },
  })

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const novosErros = validarValores(valores)
    if (contaId === '') novosErros.conta_id = 'Escolha a conta dona do cartão.'
    setAviso(null)
    setErros(novosErros)
    if (Object.keys(novosErros).length > 0) return
    criar.mutate()
  }

  const semContas = contas.data !== undefined && contas.data.contas.length === 0

  return (
    <div className="flex flex-col gap-4 p-4">
      <CabecalhoTela titulo="Novo cartão" voltarPara="/cartoes" />

      {contas.isError && (
        <p role="alert" className="text-14 text-saida-texto">
          {contas.error instanceof ApiError
            ? contas.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {aviso && (
        <p role="alert" className="text-14 text-saida-texto">
          {aviso}
        </p>
      )}
      {semContas && (
        <p className="text-14 text-muted-foreground">
          Cadastre uma conta antes de criar o cartão.{' '}
          <Link to="/controle/contas" className="font-semibold text-primary-texto underline">
            Ir para Contas
          </Link>
        </p>
      )}

      <form ref={formRef} className="flex flex-col gap-4" onSubmit={enviar}>
        <Campo rotulo="Conta dona" erro={erros.conta_id}>
          <Select
            value={contaId}
            onChange={(evento) => setContaId(evento.target.value)}
            disabled={contas.isPending || semContas}
          >
            <option value="">Escolha uma conta</option>
            {contas.data?.contas.map((conta) => (
              <option key={conta.id} value={conta.id}>
                {conta.nome}
              </option>
            ))}
          </Select>
        </Campo>

        <CamposCartao valores={valores} erros={erros} aoMudar={(parcial) => setValores({ ...valores, ...parcial })} />

        <Button type="submit" className="w-full" disabled={criar.isPending}>
          Salvar
        </Button>
      </form>
    </div>
  )
}
