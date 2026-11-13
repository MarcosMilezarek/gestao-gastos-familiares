import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/cliente'
import {
  arquivarCategoria,
  moverLancamentosCategoria,
  type CategoriaSaida,
} from '../../api/categorias'
import { BottomSheet } from '../../componentes/BottomSheet'
import { Campo } from '../../componentes/Campo'
import configuracoes from '../configuracoes/configuracoes.module.css'
import styles from './controle.module.css'

type CategoriaItem = CategoriaSaida['subcategorias'][number]

type Destino = { id: number; rotulo: string }

// Destinos válidos (fatia-2.md §3.2): a árvore já é do mesmo tipo e só traz ativas; fora da subárvore da origem.
function destinosPara(origem: CategoriaItem, arvore: CategoriaSaida[]): Destino[] {
  const destinos: Destino[] = []
  for (const raiz of arvore) {
    if (raiz.id !== origem.id) destinos.push({ id: raiz.id, rotulo: raiz.nome })
    for (const sub of raiz.subcategorias) {
      if (sub.id !== origem.id && sub.categoria_pai_id !== origem.id) {
        destinos.push({ id: sub.id, rotulo: `${raiz.nome} > ${sub.nome}` })
      }
    }
  }
  return destinos
}

type ArquivarCategoriaProps = {
  categoria: CategoriaItem
  modo: 'arquivar' | 'mover'
  arvore: CategoriaSaida[]
  aoFechar(): void
}

// "Arquivar" pede o destino só se a API responder CATEGORIA_EM_USO; "Mover lançamentos" sempre pede e mostra os movidos (fatia-2.md §5.3, 2.F10).
export function ArquivarCategoria({ categoria, modo, arvore, aoFechar }: ArquivarCategoriaProps) {
  const queryClient = useQueryClient()
  const [precisaDestino, setPrecisaDestino] = useState(modo === 'mover')
  const [destinoId, setDestinoId] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<string | null>(null)
  const corpoRef = useRef<HTMLDivElement>(null)
  const destinos = destinosPara(categoria, arvore)
  const raiz = categoria.categoria_pai_id === null

  // Foco no primeiro controle marcado como inválido (destino não escolhido ou recusado).
  useEffect(() => {
    corpoRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [erros])

  const aoTerminar = () => queryClient.invalidateQueries()

  function tratarErro(erro: unknown) {
    const campos = erro instanceof ApiError ? (erro.campos ?? {}) : {}
    const destinoRecusado = campos.mover_para_id ?? campos.destino_id
    if (destinoRecusado) setErros({ destino: destinoRecusado })
    setAviso(erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.')
    setStatus(null)
  }

  const arquivar = useMutation({
    mutationFn: () =>
      arquivarCategoria(categoria.id, destinoId ? { mover_para_id: Number(destinoId) } : {}),
    onSuccess: () => {
      aoTerminar()
      aoFechar()
    },
    onError: (erro) => {
      if (erro instanceof ApiError && erro.codigo === 'CATEGORIA_EM_USO') {
        // Pede o destino e reenvia com mover_para_id.
        setPrecisaDestino(true)
        setErros({ destino: erro.campos?.mover_para_id ?? erro.mensagem })
        return
      }
      tratarErro(erro)
    },
  })

  const mover = useMutation({
    mutationFn: () => moverLancamentosCategoria(categoria.id, { destino_id: Number(destinoId) }),
    onSuccess: ({ movidos }) => {
      aoTerminar()
      setAviso(null)
      setStatus(`${movidos} ${movidos === 1 ? 'lançamento movido' : 'lançamentos movidos'}.`)
    },
    onError: tratarErro,
  })

  const pendente = arquivar.isPending || mover.isPending

  function confirmar() {
    setAviso(null)
    setStatus(null)
    setErros({})
    if (precisaDestino && destinoId === '') {
      setErros({ destino: 'Escolha a categoria para onde os lançamentos serão movidos.' })
      return
    }
    if (modo === 'mover') {
      mover.mutate()
    } else {
      arquivar.mutate()
    }
  }

  const titulo = modo === 'mover' ? 'Mover lançamentos' : 'Arquivar categoria'
  const rotuloAcao = modo === 'mover' ? 'Mover' : precisaDestino ? 'Arquivar e mover' : 'Arquivar'
  const texto =
    modo === 'mover'
      ? `Os lançamentos de "${categoria.nome}" vão para a categoria escolhida.`
      : precisaDestino
        ? `"${categoria.nome}" tem lançamentos. Escolha para onde eles vão antes de arquivar.`
        : `"${categoria.nome}" sai da lista de categorias.`

  return (
    <BottomSheet
      titulo={titulo}
      aoFechar={aoFechar}
      rodape={
        <button
          type="button"
          className={configuracoes.botao}
          onClick={confirmar}
          disabled={pendente || (precisaDestino && destinos.length === 0)}
        >
          {rotuloAcao}
        </button>
      }
    >
      <div ref={corpoRef}>
        <p>{texto}</p>
        {raiz && (
          <p className={styles.aviso}>As subcategorias também entram nesta ação.</p>
        )}

        {precisaDestino &&
          (destinos.length === 0 ? (
            <p className={styles.aviso}>
              Não há outra categoria ativa do mesmo tipo para receber os lançamentos.
            </p>
          ) : (
            <div className={configuracoes.secao}>
              <Campo rotulo="Categoria de destino" erro={erros.destino}>
                <select
                  id="categoria-destino"
                  className={configuracoes.entrada}
                  value={destinoId}
                  onChange={(evento) => setDestinoId(evento.target.value)}
                >
                  <option value="">Escolha uma categoria</option>
                  {destinos.map((destino) => (
                    <option key={destino.id} value={destino.id}>
                      {destino.rotulo}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
          ))}

        {aviso && (
          <p role="alert" className={configuracoes.aviso}>
            {aviso}
          </p>
        )}
        {status && (
          <p role="status" className={configuracoes.status}>
            {status}
          </p>
        )}
      </div>
    </BottomSheet>
  )
}
