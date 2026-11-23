import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ApiError } from '../../api/cliente'
import { listarCategorias, type CategoriaSaida, type TipoCategoria } from '../../api/categorias'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import { IconeQuadrado } from '../../componentes/IconeQuadrado'
import { iconeDe } from '../../componentes/icones'
import { ArquivarCategoria } from './ArquivarCategoria'
import { FormCategoria } from './FormCategoria'

type CategoriaItem = CategoriaSaida['subcategorias'][number]

const ABAS: { tipo: TipoCategoria; rotulo: string }[] = [
  { tipo: 'despesa', rotulo: 'Despesas' },
  { tipo: 'receita', rotulo: 'Receitas' },
]

// Formulário aberto: sem `categoria` é criação (na raiz, ou subcategoria de `pai`); com `categoria` é edição.
type Formulario = { categoria?: CategoriaItem; pai?: CategoriaSaida }
type Arquivamento = { categoria: CategoriaItem; modo: 'arquivar' | 'mover' }

type ItemProps = { categoria: CategoriaItem; acoes: ReactNode; sub?: boolean }

// Linha de uma categoria: ícone na cor dela (nome desconhecido cai no padrão de icones.ts), nome e as ações em botões de toque.
function Item({ categoria, acoes, sub = false }: ItemProps) {
  return (
    <Card className="flex-row flex-wrap items-center gap-3 p-4">
      <div className="inline-flex" style={{ color: categoria.cor }}>
        <IconeQuadrado
          icone={iconeDe(categoria.icone)}
          tamanho={sub ? 'sm' : 'default'}
          className="bg-current/15 text-inherit"
        />
      </div>
      <span className="min-w-0 flex-1 truncate text-16 font-semibold">{categoria.nome}</span>
      <div className="flex w-full flex-wrap gap-2">{acoes}</div>
    </Card>
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
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setFormulario({ categoria: item })}
      >
        Editar
      </Button>
      {!item.fixa && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setArquivamento({ categoria: item, modo: 'arquivar' })}
        >
          Arquivar
        </Button>
      )}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setArquivamento({ categoria: item, modo: 'mover' })}
      >
        Mover lançamentos
      </Button>
    </>
  )

  return (
    <div className="flex flex-col gap-4 p-4 md:mx-auto md:w-full md:max-w-160">
      <CabecalhoTela
        titulo="Categorias"
        voltarPara="/controle"
        acao={
          <Button type="button" size="sm" onClick={() => setFormulario({})}>
            Nova categoria
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de categoria">
        {ABAS.map((aba) => (
          <Button
            key={aba.tipo}
            type="button"
            size="sm"
            variant={tipo === aba.tipo ? 'outline' : 'secondary'}
            aria-pressed={tipo === aba.tipo}
            onClick={() => setTipo(aba.tipo)}
          >
            {aba.rotulo}
          </Button>
        ))}
      </div>

      {consulta.isError && (
        <p role="alert" className="text-14 text-saida-texto">
          {consulta.error instanceof ApiError
            ? consulta.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {!dados && !consulta.isError && <p className="text-14 text-muted-foreground">Carregando…</p>}

      {dados && dados.length === 0 && (
        <EstadoVazio
          frase={`Nenhuma categoria de ${tipo === 'despesa' ? 'despesa' : 'receita'} ativa.`}
          acaoRotulo="Nova categoria"
          onAcao={() => setFormulario({})}
        />
      )}

      {dados && dados.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {dados.map((raiz) => (
            <li key={raiz.id}>
              <Item
                categoria={raiz}
                acoes={
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setFormulario({ pai: raiz })}
                    >
                      Nova subcategoria
                    </Button>
                    {acoesDe(raiz)}
                  </>
                }
              />
              {raiz.subcategorias.length > 0 && (
                <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0 pl-4">
                  {raiz.subcategorias.map((sub) => (
                    <li key={sub.id}>
                      <Item categoria={sub} acoes={acoesDe(sub)} sub />
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
