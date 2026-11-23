import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  adicionarItemCenario,
  editarItemCenario,
  type CenarioSaida,
  type ItemSaida,
  type PessoaResultado,
} from '../../api/cenarios'
import { ApiError } from '../../api/cliente'
import { BottomSheet } from '../../componentes/BottomSheet'
import { Campo } from '../../componentes/Campo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { eZero, mascararEntrada, paraApi } from '../../formatacao/dinheiro'

// Valor do seletor de dono para despesa do casal (dono_usuario_id null).
const CASAL = 'casal'

type FormItemCenarioProps = {
  cenarioId: number
  // Pessoas do casal do cenário (resultado.pessoas): [A, B].
  pessoas: PessoaResultado[]
  // Item em edição; ausente na criação (com seletor de tipo).
  item?: ItemSaida
  aoSalvar(cenario: CenarioSaida): void
  aoFechar(): void
}

// Valor da API ("1234.50") -> texto mascarado ("1.234,50"), sem passar por number.
function paraCampo(valor: string): string {
  const [inteiro = '0', centavos = ''] = valor.split('.')
  return mascararEntrada(inteiro + centavos.padEnd(2, '0'))
}

// Valor do seletor de dono -> corpo da requisição: "casal" vira null.
function donoDoCorpo(dono: string): number | null {
  return dono === CASAL ? null : Number.parseInt(dono, 10)
}

// Criar ou editar item do cenário (fatia-7.md §5.1, 7.F6). Erros de campo vêm de ApiError.campos; os demais (CASAL_ENCERRADO, NAO_ENCONTRADO) aparecem na mensagem do topo.
export function FormItemCenario({
  cenarioId,
  pessoas,
  item,
  aoSalvar,
  aoFechar,
}: FormItemCenarioProps) {
  const [tipo, setTipo] = useState<'renda' | 'despesa'>(item?.tipo ?? 'renda')
  const [dono, setDono] = useState(() =>
    item ? (item.dono_usuario_id === null ? CASAL : String(item.dono_usuario_id)) : '',
  )
  const [descricao, setDescricao] = useState(item?.descricao ?? '')
  const [valor, setValor] = useState(() => (item ? paraCampo(item.valor) : mascararEntrada('')))
  const [erros, setErros] = useState<Record<string, string>>({})
  const [aviso, setAviso] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Foco no primeiro controle marcado como inválido (erro do cliente ou da API).
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [erros])

  // Trocar o tipo (só na criação) zera o dono, que pode não existir no novo tipo.
  function trocarTipo(novo: 'renda' | 'despesa') {
    setTipo(novo)
    setDono(novo === 'despesa' ? CASAL : '')
  }

  const salvar = useMutation({
    mutationFn: () => {
      // Edição não envia tipo (não muda).
      const corpo = {
        dono_usuario_id: donoDoCorpo(dono),
        descricao: descricao.trim(),
        valor: paraApi(valor),
      }
      return item
        ? editarItemCenario(cenarioId, item.id, corpo)
        : adicionarItemCenario(cenarioId, { tipo, ...corpo })
    },
    onSuccess: (saida) => aoSalvar(saida),
    onError: (erro) => {
      setErros(erro instanceof ApiError ? (erro.campos ?? {}) : {})
      setAviso(erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.')
    },
  })

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setAviso(null)
    const falhas: Record<string, string> = {}
    if (descricao.trim() === '') falhas.descricao = 'Informe a descrição.'
    if (eZero(paraApi(valor))) falhas.valor = 'Informe um valor maior que zero.'
    if (tipo === 'renda' && dono === '') falhas.dono_usuario_id = 'Escolha quem recebe a renda.'
    setErros(falhas)
    if (Object.keys(falhas).length > 0) return
    salvar.mutate()
  }

  return (
    <BottomSheet
      titulo={item ? 'Editar item' : 'Novo item'}
      aoFechar={aoFechar}
      rodape={
        <Button type="submit" form="form-item-cenario" disabled={salvar.isPending}>
          Salvar
        </Button>
      }
    >
      {aviso && (
        <p role="alert" className="mb-2 text-14 text-saida-texto">
          {aviso}
        </p>
      )}

      <form ref={formRef} id="form-item-cenario" className="flex flex-col gap-4" onSubmit={enviar}>
        {!item && (
          <Campo rotulo="Tipo" erro={erros.tipo}>
            <Select
              value={tipo}
              onChange={(evento) =>
                trocarTipo(evento.target.value === 'despesa' ? 'despesa' : 'renda')
              }
            >
              <option value="renda">Renda</option>
              <option value="despesa">Despesa</option>
            </Select>
          </Campo>
        )}

        <Campo rotulo="Dono" erro={erros.dono_usuario_id}>
          <Select
            value={dono}
            onChange={(evento) => setDono(evento.target.value)}
          >
            {tipo === 'renda' ? (
              <option value="" disabled>
                Escolha
              </option>
            ) : (
              <option value={CASAL}>Casal</option>
            )}
            {pessoas.map((pessoa) => (
              <option key={pessoa.usuario_id} value={String(pessoa.usuario_id)}>
                {pessoa.nome}
              </option>
            ))}
          </Select>
        </Campo>

        <Campo rotulo="Descrição" erro={erros.descricao}>
          <Input
            value={descricao}
            onChange={(evento) => setDescricao(evento.target.value)}
            autoComplete="off"
          />
        </Campo>

        <Campo rotulo="Valor" erro={erros.valor}>
          <Input
            type="text"
            inputMode="numeric"
            placeholder="0,00"
            value={valor}
            onChange={(evento) => setValor(mascararEntrada(evento.target.value))}
          />
        </Campo>
      </form>
    </BottomSheet>
  )
}
