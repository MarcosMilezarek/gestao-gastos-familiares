export class ApiError extends Error {
  status: number
  codigo: string
  mensagem: string
  campos?: Record<string, string>

  constructor(
    status: number,
    codigo: string,
    mensagem: string,
    campos?: Record<string, string>,
  ) {
    super(mensagem)
    this.name = 'ApiError'
    this.status = status
    this.codigo = codigo
    this.mensagem = mensagem
    this.campos = campos
  }
}

// Retry do React Query: erro 4xx é determinístico (não repete); status 0 (sem conexão) repete; para na 3ª tentativa.
export function repetirSem4xx(tentativas: number, erro: unknown): boolean {
  return !(erro instanceof ApiError && erro.status >= 400 && erro.status < 500) && tentativas < 3
}

let aoNaoAutenticado: (() => void) | null = null

// Registrado pela guarda de rota; login, logout e GET /api/sessao (todos em /api/sessao) não disparam.
export function definirAoNaoAutenticado(fn: (() => void) | null) {
  aoNaoAutenticado = fn
}

async function requisitar<T>(
  metodo: string,
  caminho: string,
  corpo?: unknown,
): Promise<T> {
  let res: Response
  try {
    res = await fetch(caminho, {
      method: metodo,
      credentials: 'same-origin',
      headers: corpo === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
  } catch {
    // Sem resposta do servidor (rede caída): o fetch rejeita com TypeError, que vira ApiError de status 0.
    throw new ApiError(
      0,
      'SEM_CONEXAO',
      'Sem conexão com o servidor. Verifique a internet e tente de novo.',
    )
  }

  if (!res.ok) {
    if (res.status === 401 && caminho !== '/api/sessao') aoNaoAutenticado?.()
    const dados = await res.json().catch(() => null)
    const erro = dados?.erro
    throw new ApiError(
      res.status,
      erro?.codigo ?? 'ERRO_INTERNO',
      erro?.mensagem ?? 'Erro inesperado. Tente novamente.',
      erro?.campos,
    )
  }

  if (res.status === 204) {
    return undefined as T
  }
  return (await res.json()) as T
}

export const cliente = {
  get: <T>(caminho: string) => requisitar<T>('GET', caminho),
  post: <T>(caminho: string, corpo?: unknown) => requisitar<T>('POST', caminho, corpo),
  patch: <T>(caminho: string, corpo?: unknown) => requisitar<T>('PATCH', caminho, corpo),
  put: <T>(caminho: string, corpo?: unknown) => requisitar<T>('PUT', caminho, corpo),
  del: <T>(caminho: string, corpo?: unknown) => requisitar<T>('DELETE', caminho, corpo),
}
