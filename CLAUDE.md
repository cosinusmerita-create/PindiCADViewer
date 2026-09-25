# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

PindiCADViewer — a 3D CAD viewer (STEP/STP, STL, OBJ, and its own `.pindi` project format) by Ferme Écologique Pindi. It ships as a PWA on GitHub Pages (`/PindiCADViewer/`) and as a Windows/Linux/Mac Electron desktop app. UI text is in French.

## Stack

- React 19 + TypeScript (~6.0) + Vite 8, Tailwind CSS 4 (`@tailwindcss/vite`)
- three.js + `@react-three/fiber` / `drei` / `postprocessing`
- `zustand` for state, `jspdf` for PDF export, `earcut` for triangulation, `lucide-react` for icons
- `occt-import-js` (WASM, served from `public/occt-import-js/`) parses STEP files
- Electron 44 + electron-builder; `vite-plugin-pwa` for the web build
- Linter: `oxlint` (no ESLint/Prettier). No test suite.

## Commands

```bash
npm run dev               # Vite dev server on :5173
npm run build             # tsc -b && vite build (web/PWA, base /PindiCADViewer/)
npm run build:electron    # same, with --mode electron (relative base, no PWA)
npm run lint              # oxlint
npm run electron:dev      # dev server + Electron window
npm run electron:preview  # build for Electron, then run it against dist/
npm run electron:build    # build + electron-builder -> electron-dist/
npm run deploy            # build + gh-pages -d dist
npm run release           # deploy + electron:build
```

Type-check with `npx tsc -b` (strict `tsconfig.app.json` / `tsconfig.node.json`). `dist/` and `electron-dist/` are build output and git-ignored — do not edit them.

## Architecture

- `src/App.tsx` — top-level layout; wires toolbar, panels, dialogs, file drop.
- `src/components/Viewer3D.tsx` — the R3F scene (largest file, ~1.2k lines): rendering, picking, selection, measurement, clipping, animation frame loop.
- `src/hooks/useModelState.ts` — the central zustand store (model tree, display mode, theme, measurements, annotations, clipping, animations, AI chat, camera). Other hooks: `useFileLoader`, `useToastStore`, `useDevice`.
- `src/types/model.ts` — shared types (`ComponentNode`, `Measurement`, `DisplayMode`, `Theme`, `ProjectFile`, …). `src/types/electron.d.ts` types `window.electronAPI`.
- `src/utils/` — pure/domain logic, one concern per file:
  - Loading: `stepLoader.ts` (spawns `src/workers/step.worker.js`, which runs occt-import-js off the main thread), `stlLoader.ts`, `objLoader.ts`, `brepEdges.ts`, `surfacePatches.ts`
  - Scene/camera: `cameraFit.ts`, `cameraViews.ts`, `animateCamera.ts`, `displayMode.ts`, `colorPalette.ts`, `themeColors.ts`
  - Sections: `clippingPlanes.ts`, `clippingCap.ts`, `sectionCap.ts`
  - Measuring: `snapping.ts`, `dimensioning.ts`, `edgeAnalysis.ts`, `selectionKey.ts`
  - Flow visualisation: `flowPassages.ts`, `flowPathBuilder.ts`, `flowTrajectory.ts`, `fluidTypes.ts`
  - Persistence/export: `projectFile.ts` (`.pindi`), `fileActions.ts`, `pdfExport.ts`, `imageUtils.ts`
  - AI commands: `aiAssistant.ts` parses natural-language (French) commands into an `AiIntent` union (explode, rotate, flow paths, colors, …) that the app then executes against the live tree.
  - Collision: `collision.ts` (AABB broad phase + `three-mesh-bvh` exact test, swept/bisected move that stops at first new contact, interference scan), `collisionFeedback.ts` (red emissive highlight, beep); UI in `components/CollisionControls.tsx`, gizmo in `components/CollisionMover.tsx` (shares the pivot registry with `AnimationController`)
  - 3D printing prep: `printSplit.ts` (world-space triangle soup -> Z-up print space via a proper rotation, scale, piece plan, bed-fit check, zip of pieces via `fflate`), `meshCut.ts` (slab clipping with canonical edge/plane intersections + earcut caps, so every piece is watertight; nesting-depth outer/hole classification handles assemblies), `stlWriter.ts` (binary STL); state in `hooks/usePrintStore.ts`, UI in `components/PrintPanel.tsx`, translucent cut planes in `components/PrintCutPlanes.tsx`. Port of Pindi Blade Profiler's scale + fabrication-export modules, with a different joint: optional square-pin pockets (`meshCut.ts` `planJoints`, only for the selected parts) carved into the cap faces and a separate pins STL; no central through-bore (no CSG). Export only - never rescales the displayed model.
  - Tree/animation: `componentTree.ts`, `animationPivot.ts`, `explodeModes.ts` (pure exploded-view layouts: radial, axial X/Y/Z, per-sub-assembly, sequential; UI in `components/ExplodeControls.tsx`, guide lines drawn by `AnimationController` in `Viewer3D.tsx`)
- `src/components/MenuBar.tsx` — top bar (logo + Fichier/Affichage/Aide). In Electron the OS title bar is hidden (`titleBarStyle: 'hidden'` + `titleBarOverlay` in `main.js`) and this bar is the drag region (`.app-drag` / `.app-no-drag` in `index.css`); the native menu is still installed only for its accelerators.
- `electron/` — `main.js` (window, file associations, `read-file` IPC), `preload.js` (exposes `window.electronAPI` via contextBridge). It is CommonJS (`electron/package.json` sets `"type": "commonjs"`) while the rest of the repo is ESM.

## Things to know

- **Two build targets from one `vite.config.ts`**: web uses absolute base `/PindiCADViewer/` and the PWA plugin; Electron (`--mode electron`) uses `base: './'` because it loads `dist/index.html` via `file://`, and disables the service worker. Keep asset references compatible with both.
- `electron/main.js` distinguishes dev / preview / packaged with `app.isPackaged` plus the `--preview` flag; don't collapse this.
- Electron security: `nodeIntegration: false`, `contextIsolation: true`. Add renderer↔main capabilities only through `preload.js` + `ipcMain.handle`, and type them in `src/types/electron.d.ts`.
- `public/occt-import-js/*.wasm` is ~7 MB; the PWA precache limit is raised to 10 MB for it. It is excluded from oxlint.
- Existing code uses long explanatory comments for non-obvious decisions; follow that style rather than stripping them.
- Electron installers are built to `electron-dist/` (can exceed GitHub's 100 MB limit — never commit it).
- `build.electronDist` points at `node_modules/electron/dist`: on this machine electron-builder's default extract-then-rename of `win-unpacked.tmp` fails with EPERM (antivirus scanning the fresh `electron.exe`), so it copies the local Electron instead. Keep `electron` in devDependencies at the version to ship.
