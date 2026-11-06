# Gokul Retail

Billing and stock software for Gokul Oils. Phase 1 is UI only: real React screens running on mock data.

## Run

```
npm install
npm run dev:pos      # Gokul POS      http://localhost:5173  (PIN 1234)
npm run dev:office   # Gokul Office   http://localhost:5174  (password 1111)
npm run typecheck
npm run lint
npm run build
```

## Build and install the desktop apps

Needs Rust (`%USERPROFILE%\.cargo\bin` on PATH), Visual Studio Build Tools and WebView2.

```
npm run tauri:pos      # run POS in a native window (dev)
npm run tauri:office   # run Office in a native window (dev)
npm run dist:pos       # build the POS installer
npm run dist:office    # build the Office installer
```

Installers land in `target/release/bundle/nsis/` (`Gokul POS_0.1.0_x64-setup.exe`, `Gokul Office_0.1.0_x64-setup.exe`).
Double-click to install for the current user (no admin). Silent install: run the setup with `/S`.
Start menu and desktop shortcuts are created. The apps still use mock data until the backend phase.

## Layout

- `apps/pos` - billing counter
- `apps/office` - back office
- `packages/ui` - design system (tokens, components, layouts)
- `packages/data` - shared types, `Api` interface, in-memory `mockApi`, money and GST helpers
- `docs/` - plan and design brief
