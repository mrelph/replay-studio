import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import AudienceView from './components/AudienceView/AudienceView'
import { ThemeProvider } from './theme/ThemeProvider'
import './index.css'
import { ensureFontLoaded, FONT_FAMILIES } from './utils/textFormat'
import { fabric } from './lib/fabric'

// Load caption fonts up front; drop any widths Fabric measured against a fallback meanwhile.
void Promise.all(FONT_FAMILIES.map((f) => ensureFontLoaded(f.value))).then(() => fabric.util.clearFabricFontCache())

const isAudienceWindow = new URLSearchParams(window.location.search).get('audience') === 'true'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      {isAudienceWindow ? <AudienceView /> : <App />}
    </ThemeProvider>
  </React.StrictMode>
)
