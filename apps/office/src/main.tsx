import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/inter/wght.css';
import '@gokul/ui/tokens.css';
import '@gokul/ui/base.css';
import './index.css';
import { App } from './App';
import { showWindowWhenReady } from './windowReady';

/** Shows the hidden desktop window as soon as the first screen has mounted. */
function Root() {
  useEffect(() => showWindowWhenReady(), []);
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
