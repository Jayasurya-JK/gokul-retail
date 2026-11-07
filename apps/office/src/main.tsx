import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/inter/wght.css';
import '@gokul/ui/tokens.css';
import '@gokul/ui/base.css';
import './index.css';

// Load the rupee sign for every weight we use before the first screen paints, so it never flashes in a fallback font.
void Promise.all([400, 500, 600, 700, 800].map((w) => document.fonts.load(`${w} 16px 'Gokul Rupee'`, '₹'))).catch(() => undefined);
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
