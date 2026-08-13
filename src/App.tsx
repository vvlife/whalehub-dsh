import { Footer, Nav } from './components/Chrome'
import { useHashRoute } from './lib/router'
import { Home } from './pages/Home'
import { PluginDetail } from './pages/PluginDetail'
import { Plugins } from './pages/Plugins'
import { About, Submit } from './pages/Static'

export function App() {
  const route = useHashRoute()
  const path = route.split('?')[0]

  let page: React.ReactNode
  if (path === '/' || path === '') page = <Home />
  else if (path === '/plugins') page = <Plugins />
  else if (path.startsWith('/plugin/')) page = <PluginDetail slug={decodeURIComponent(path.slice(8))} />
  else if (path === '/submit') page = <Submit />
  else if (path === '/about') page = <About />
  else page = <Plugins />

  return (
    <div className="app">
      <Nav />
      {page}
      <Footer />
    </div>
  )
}
