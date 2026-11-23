import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { criarCenario, editarCenario, type CenarioResumo } from '../../api/cenarios'
import { ApiError } from '../../api/cliente'
import { BottomSheet } from '../../componentes/BottomSheet'
import { Campo } from '../../componentes/Campo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const TAMANHO_MAXIMO_NOME = 80

type FormCenarioProps = {
  // Sem cenário: criação. Com cenário: renomear.
  cenario?: CenarioResumo
  aoFechar(): void
}

// Criar ou renomear cenário. Erros de campo vêm de ApiError.campos; os demais (SEM_VINCULO, CASAL_ENCERRADO) aparecem na mensagem do topo.
export function FormCenario({ cenario, aoFechar }: FormCenarioProps) {
  const queryClient = useQueryClient()
  const [nome, setNome] = useState(cenario?.nome ?? '')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [aviso, setAviso] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Foco no primeiro controle marcado como inválido (erro do cliente ou da API).
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [erros])

  const salvar = useMutation({
    mutationFn: () => {
      const corpo = { nome: nome.trim() }
      return cenario ? editarCenario(cenario.id, corpo) : criarCenario(corpo)
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
    const nomeLimpo = nome.trim()
    if (nomeLimpo === '') {
      falhas.nome = 'Informe o nome do cenário.'
    } else if (nomeLimpo.length > TAMANHO_MAXIMO_NOME) {
      falhas.nome = `Use no máximo ${TAMANHO_MAXIMO_NOME} caracteres.`
    }
    setErros(falhas)
    if (Object.keys(falhas).length > 0) return
    salvar.mutate()
  }

  return (
    <BottomSheet
      titulo={cenario ? 'Renomear cenário' : 'Novo cenário'}
      aoFechar={aoFechar}
      rodape={
        <Button type="submit" form="form-cenario" disabled={salvar.isPending}>
          Salvar
        </Button>
      }
    >
      {aviso && (
        <p role="alert" className="mb-2 text-14 text-saida-texto">
          {aviso}
        </p>
      )}

      <form ref={formRef} id="form-cenario" className="flex flex-col gap-4" onSubmit={enviar}>
        <Campo rotulo="Nome" erro={erros.nome}>
          <Input
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            autoComplete="off"
          />
        </Campo>
      </form>
    </BottomSheet>
  )
}
