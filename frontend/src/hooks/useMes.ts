import { useSearchParams } from 'react-router'
import { useSessao } from './useSessao'

const PADRAO_MES = /^\d{4}-(0[1-9]|1[0-2])$/

// Mês da tela: ?mes=AAAA-MM; sem parâmetro válido, o mês de "hoje" do servidor.
// Enquanto a sessão não carregou, mes é "": quem consome não deve formatar
// nem consultar a API com mes vazio.
export function useMes(): { mes: string; setMes(m: string): void } {
  const [params, setParams] = useSearchParams()
  const { data } = useSessao()

  const naUrl = params.get('mes')
  const hoje = data?.hoje.slice(0, 7) ?? ''
  const mes = naUrl !== null && PADRAO_MES.test(naUrl) ? naUrl : hoje

  function setMes(m: string) {
    setParams((atual) => {
      const novo = new URLSearchParams(atual)
      novo.set('mes', m)
      return novo
    })
  }

  return { mes, setMes }
}
