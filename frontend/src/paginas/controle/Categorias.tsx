import { useState, type CSSProperties, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '../../api/cliente'
import { listarCategorias, type CategoriaSaida, type TipoCategoria } from '../../api/categorias'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import { iconeDe } from '../../componentes/icones'
import { ArquivarCategoria } from './ArquivarCategoria'
import { FormCategoria } from './FormCategoria'
import styles from './controle.module.css'

type CategoriaItem = CategoriaSaida['subcategorias'][number]

const ABAS: { tipo: TipoCategoria; rotulo: string }[] = [
  { tipo: 'despesa', rotulo: 'Despesas' },
  { tipo: 'receita', rotulo: 'Receitas' },
]

// Formulário aberto: sem `categoria` é criação (na raiz, ou subcategoria de `pai`); com `categoria` é edição.
type Formulario = { categoria?: CategoriaItem; pai?: CategoriaSaida }
type Arquivamento = { categoria: CategoriaItem; modo: 'arquivar' | 'mover' }

const ABA_SELECIONADA: CSSProperties = { background: 'var(--cor-primaria)', color: 'var(--cor-fundo)' }
const LISTA: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--espaco-3)',
  margin: 0,
  padding: 0,
  listStyle: 'none',
}
const SUBLISTA: CSSProperties = { ...LISTA, paddingLeft: 'var(--espaco-4)' }

// Ícone da categoria na cor dela (nome desconhecido cai no padrão de icones.ts).
function iconeColorido(categoria: CategoriaItem): ReactNode {
  const Icone = iconeDe(categoria.icone)
  return <Icone aria-hidden="true" size={20} color={categoria.cor} />
}

type ItemProps = { categoria: CategoriaItem; acoes: ReactNode }

// Linha de uma categoria: ícone e cor, nome e as ações em botões de toque.
function Item({ categoria, acoes }: ItemProps) {
  return (
    <div style={LISTA}>
      <p style={{ display: 'flex', alignItems: 'center', gap: 'var(--espaco-2)', margin: 0 }}>
        {iconeColorido(categoria)}
        <span style={{ color: 'var(--cor-texto)' }}>{categoria.nome}</span>
      </p>
      <div className={styles.chips}>{acoes}</div>
    </div>
  )
}

// Categorias ativas por tipo, em árvore (fatia-2.md §5.1, 2.F10). Sem excluir nem desarquivar (D8).
export function Categorias() {
  const [tipo, setTipo] = useState<TipoCategoria>('despesa')
  const [formulario, setFormulario] = useState<Formulario | null>(null)
  const [arquivamento, setArquivamento] = useState<Arquivamento | null>(null)

  const consulta = useQuery({
    queryKey: ['categorias', tipo],
    queryFn: () => listarCategorias({ tipo }),
  })
  const dados = consulta.data

  // Editar, mover lançamentos e arquivar: Salário (fixa) não arquiva; o nome dela não muda no FormCategoria.
  const acoesDe = (item: CategoriaItem) => (
    <>
      <button
        type="button"
        className={styles.chip}
        onClick={() => setFormulario({ categoria: item })}
      >
        Editar
      </button>
      {!item.fixa && (
        <button
          type="button"
          className={styles.chip}
          onClick={() => setArquivamento({ categoria: item, modo: 'arquivar' })}
        >
          Arquivar
        </button>
      )}
      <button
        type="button"
        className={styles.chip}
        onClick={() => setArquivamento({ categoria: item, modo: 'mover' })}
      >
        Mover lançamentos
      </button>
    </>
  )

  return (
    <div className={styles.pagina}>
      <h1 className={styles.titulo}>Categorias</h1>

      <div className={styles.chips} role="group" aria-label="Tipo de categoria">
        {ABAS.map((aba) => (
          <button
            key={aba.tipo}
            type="button"
            className={styles.chip}
            aria-pressed={tipo === aba.tipo}
            style={tipo === aba.tipo ? ABA_SELECIONADA : undefined}
            onClick={() => setTipo(aba.tipo)}
          >
            {aba.rotulo}
          </button>
        ))}
        <button type="button" className={styles.chip} onClick={() => setFormulario({})}>
          Nova categoria
        </button>
      </div>

      {consulta.isError && (
        <p role="alert" className={styles.erro}>
          {consulta.error instanceof ApiError
            ? consulta.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {!dados && !consulta.isError && <p className={styles.aviso}>Carregando…</p>}

      {dados && dados.length === 0 && (
        <EstadoVazio
          frase={`Nenhuma categoria de ${tipo === 'despesa' ? 'despesa' : 'receita'} ativa.`}
          acaoRotulo="Nova categoria"
          onAcao={() => setFormulario({})}
        />
      )}

      {dados && dados.length > 0 && (
        <ul style={LISTA}>
          {dados.map((raiz) => (
            <li key={raiz.id}>
              <Item
                categoria={raiz}
                acoes={
                  <>
                    <button
                      type="button"
                      className={styles.chip}
                      onClick={() => setFormulario({ pai: raiz })}
                    >
                      Nova subcategoria
                    </button>
                    {acoesDe(raiz)}
                  </>
                }
              />
              {raiz.subcategorias.length > 0 && (
                <ul style={{ ...SUBLISTA, marginTop: 'var(--espaco-3)' }}>
                  {raiz.subcategorias.map((sub) => (
                    <li key={sub.id}>
                      <Item categoria={sub} acoes={acoesDe(sub)} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {formulario && (
        <FormCategoria
          tipo={tipo}
          pai={formulario.pai}
          categoria={formulario.categoria}
          aoFechar={() => setFormulario(null)}
        />
      )}

      {arquivamento && dados && (
        <ArquivarCategoria
          categoria={arquivamento.categoria}
          modo={arquivamento.modo}
          arvore={dados}
          aoFechar={() => setArquivamento(null)}
        />
      )}
    </div>
  )
}
