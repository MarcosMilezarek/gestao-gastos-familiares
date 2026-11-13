import { Link, Route, Routes } from 'react-router'
import estado from './componentes/estado.module.css'
import { RotaProtegida } from './componentes/RotaProtegida'
import { Shell } from './componentes/Shell'
import { Cadastrar } from './paginas/entrada/Cadastrar'
import { Entrar } from './paginas/entrada/Entrar'
import { Inicio } from './paginas/inicio/Inicio'
import { Projecao } from './paginas/inicio/Projecao'
import { Cartoes } from './paginas/cartoes/Cartoes'
import { CadastroCartao } from './paginas/cartoes/CadastroCartao'
import { DetalheCartao } from './paginas/cartoes/DetalheCartao'
import { Fatura } from './paginas/cartoes/Fatura'
import { Configuracoes } from './paginas/configuracoes/Configuracoes'
import { Perfil } from './paginas/configuracoes/Perfil'
import { Senha } from './paginas/configuracoes/Senha'
import { Vinculo } from './paginas/configuracoes/Vinculo'
import { Balanco } from './paginas/controle/Balanco'
import { Categorias } from './paginas/controle/Categorias'
import { Contas } from './paginas/controle/Contas'
import { ContasArquivadas } from './paginas/controle/ContasArquivadas'
import { Controle } from './paginas/controle/Controle'
import { ControleConta } from './paginas/controle/ControleConta'
import { Proporcao } from './paginas/controle/Proporcao'
import { Relatorios, RelatorioPorTipo } from './paginas/controle/Relatorios'
import { Tags } from './paginas/controle/Tags'
import { DetalheMeta } from './paginas/metas/DetalheMeta'
import { Metas } from './paginas/metas/Metas'
import { Planejamento } from './paginas/planejamento/Planejamento'
import { Orcamento } from './paginas/planejamento/Orcamento'
import { Cenarios } from './paginas/planejamento/Cenarios'
import { Cenario } from './paginas/planejamento/Cenario'
import { PlanoMetas } from './paginas/planejamento/PlanoMetas'

function NaoEncontrada() {
  return (
    <div className={estado.vazio}>
      <p className={estado.frase}>Página não encontrada.</p>
      <Link to="/" className={estado.voltar}>
        Voltar ao início
      </Link>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/cadastrar" element={<Cadastrar />} />
      <Route element={<RotaProtegida />}>
        <Route element={<Shell />}>
          <Route index element={<Inicio />} />
          <Route path="/projecao" element={<Projecao />} />
          <Route path="/controle" element={<Controle />} />
          <Route path="/controle/contas" element={<Contas />} />
          <Route path="/controle/contas/arquivadas" element={<ContasArquivadas />} />
          <Route path="/controle/contas/:contaId" element={<ControleConta />} />
          <Route path="/controle/categorias" element={<Categorias />} />
          <Route path="/controle/tags" element={<Tags />} />
          <Route path="/controle/proporcao" element={<Proporcao />} />
          <Route path="/controle/balanco" element={<Balanco />} />
          <Route path="/controle/relatorios" element={<Relatorios />} />
          <Route path="/controle/relatorios/:tipo" element={<RelatorioPorTipo />} />
          <Route path="/cartoes" element={<Cartoes />} />
          <Route path="/cartoes/novo" element={<CadastroCartao />} />
          <Route path="/cartoes/:cartaoId" element={<DetalheCartao />} />
          <Route path="/cartoes/:cartaoId/faturas/:mes" element={<Fatura />} />
          <Route path="/metas" element={<Metas />} />
          <Route path="/metas/:metaId" element={<DetalheMeta />} />
          <Route path="/planejamento" element={<Planejamento />} />
          <Route path="/planejamento/orcamento" element={<Orcamento />} />
          <Route path="/planejamento/cenarios" element={<Cenarios />} />
          <Route path="/planejamento/cenarios/:cenarioId" element={<Cenario />} />
          <Route path="/planejamento/plano-de-metas" element={<PlanoMetas />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
          <Route path="/configuracoes/perfil" element={<Perfil />} />
          <Route path="/configuracoes/senha" element={<Senha />} />
          <Route path="/configuracoes/vinculo" element={<Vinculo />} />
          <Route path="*" element={<NaoEncontrada />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
