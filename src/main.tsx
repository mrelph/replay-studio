import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import AudienceView from './components/AudienceView/AudienceView'
import './index.css'

const isAudienceWindow = new URLSearchParams(window.location.search).get('audience') === 'true'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isAudienceWindow ? <AudienceView /> : <App />}
  </React.StrictMode>
)
