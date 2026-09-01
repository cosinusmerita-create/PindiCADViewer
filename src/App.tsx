import { useEffect } from 'react'
import { Toolbar } from './components/Toolbar'
import { Viewer3D } from './components/Viewer3D'
import { FileDropZone } from './components/FileDropZone'
import { ModelInfoPanel } from './components/ModelInfoPanel'
import { ComponentTree } from './components/ComponentTree'
import { ClippingPlane } from './components/ClippingPlane'
import { StatusBar } from './components/StatusBar'
import { ContextMenu } from './components/ContextMenu'
import { PipetteCursor } from './components/PipetteCursor'
import { MeasurementsPanel } from './components/MeasurementsPanel'
import { AnimationPanel } from './components/AnimationPanel'
import { DimensionSheetPanel } from './components/DimensionSheetPanel'
import { AnnotationPopup } from './components/AnnotationPopup'
import { ToastHost } from './components/ToastHost'
import { HelpPanel } from './components/HelpPanel'
import { PindiSourcePrompt } from './components/PindiSourcePrompt'
import { CloseConfirmDialog } from './components/CloseConfirmDialog'
import { GroupNameDialog } from './components/GroupNameDialog'
import { InstallPrompt } from './components/InstallPrompt'
import { AnimationAssistant } from './components/AnimationAssistant'
import { saveProjectFile, exportTechnicalPdf, requestCloseProject } from './utils/fileActions'
import { useModelStore, THEME_STORAGE_KEY } from './hooks/useModelState'
import { useToastStore } from './hooks/useToastStore'
import { useFileLoader } from './hooks/useFileLoader'
import type { DisplayMode } from './types/model'

const DISPLAY_MODE_SHORTCUTS: Record<string, DisplayMode> = {
  '1': 'shaded-edges',
  '2': 'shaded',
  '3': 'wireframe',
  '4': 'hidden-lines-visible',
  '5': 'hidden-lines-removed',
  '6': 'realistic',
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

function App() {
  const object = useModelStore((s) => s.object)
  const setDisplayMode = useModelStore((s) => s.setDisplayMode)
  const clearSelection = useModelStore((s) => s.clearSelection)
  const selectAll = useModelStore((s) => s.selectAll)
  const invertSelection = useModelStore((s) => s.invertSelection)
  const pipetteMode = useModelStore((s) => s.pipetteMode)
  const exitPipetteMode = useModelStore((s) => s.exitPipetteMode)
  const measureMode = useModelStore((s) => s.measureMode)
  const exitMeasureMode = useModelStore((s) => s.exitMeasureMode)
  const annotationMode = useModelStore((s) => s.annotationMode)
  const exitAnnotationMode = useModelStore((s) => s.exitAnnotationMode)
  const showHelp = useModelStore((s) => s.showHelp)
  const setShowHelp = useModelStore((s) => s.setShowHelp)
  const toggleHelp = useModelStore((s) => s.toggleHelp)
  const goToView = useModelStore((s) => s.goToView)
  const resetView = useModelStore((s) => s.resetView)
  const showGrid = useModelStore((s) => s.showGrid)
  const setShowGrid = useModelStore((s) => s.setShowGrid)
  const toggleMeasureMode = useModelStore((s) => s.toggleMeasureMode)
  const theme = useModelStore((s) => s.theme)
  const hasUnsavedChanges = useModelStore((s) => s.hasUnsavedChanges)
  const pushToast = useToastStore((s) => s.pushToast)
  const { loadFile, openFilePicker } = useFileLoader()

  // The store's own initial value already resolved localStorage/system
  // preference (see getInitialTheme in useModelState.ts) - this just keeps
  // the DOM class and localStorage in sync with it from mount onward,
  // including every later change. Dark has no class of its own (it's the
  // :root default in index.css), so only one of the other two is ever set.
  useEffect(() => {
    document.body.classList.toggle('light-mode', theme === 'light')
    document.body.classList.toggle('solidworks-mode', theme === 'solidworks')
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  // Electron only (see electron/main.js) - fires when the user opens a
  // file via the native "Ouvrir un fichier..." menu item, a CLI/launch
  // argument, or double-clicking a .step/.stp/.stl/.obj/.pindi file
  // (Windows file association / macOS 'open-file'). The main process only
  // sends the path; readFile round-trips through the preload bridge to
  // Node's fs since a renderer fetch('file://...') would need webSecurity
  // disabled to reliably avoid CORS rejections. Wrapping the bytes in a
  // File lets this reuse loadFile() unchanged - the exact same pipeline
  // drag-and-drop and the toolbar's picker already go through.
  useEffect(() => {
    if (!window.electronAPI?.onOpenFile) return
    window.electronAPI.onOpenFile(async (filePath) => {
      try {
        const bytes = await window.electronAPI!.readFile(filePath)
        const fileName = filePath.split(/[\\/]/).pop() ?? filePath
        await loadFile(new File([bytes], fileName))
      } catch {
        pushToast(`Impossible d'ouvrir le fichier : ${filePath}`)
      }
    })
  }, [loadFile, pushToast])

  // Warns before a page reload/tab close discards unsaved work - browsers
  // ignore the custom returnValue text and show their own generic prompt,
  // but setting it (and calling preventDefault) is what triggers that
  // prompt at all.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.onbeforeunload = onBeforeUnload
    return () => {
      window.onbeforeunload = null
    }
  }, [hasUnsavedChanges])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const ctrlOrCmd = e.ctrlKey || e.metaKey

      // F1 and Ctrl+S/Ctrl+P are global regardless of focus - F1 never
      // types a character, and Ctrl+S/Ctrl+P also replace the browser's
      // own save-page/print dialogs, which fire the same way everywhere.
      if (e.key === 'F1') {
        e.preventDefault()
        toggleHelp()
        return
      }
      if (ctrlOrCmd && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        openFilePicker()
        return
      }
      if (ctrlOrCmd && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (object) saveProjectFile(pushToast)
        return
      }
      if (ctrlOrCmd && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        if (object) void exportTechnicalPdf(pushToast)
        return
      }
      if (ctrlOrCmd && e.key.toLowerCase() === 'w') {
        e.preventDefault()
        if (object) requestCloseProject()
        return
      }

      if (isTypingTarget(e.target)) return

      if (e.key === '?') {
        toggleHelp()
        return
      }

      if (e.key === 'Escape') {
        if (showHelp) setShowHelp(false)
        else if (pipetteMode) exitPipetteMode()
        else if (measureMode) exitMeasureMode()
        else if (annotationMode) exitAnnotationMode()
        else clearSelection()
        return
      }

      if (!object) return

      if (ctrlOrCmd && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        selectAll()
        return
      }
      if (ctrlOrCmd && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        clearSelection()
        return
      }
      if (ctrlOrCmd && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        invertSelection()
        return
      }

      if (e.key in DISPLAY_MODE_SHORTCUTS) {
        setDisplayMode(DISPLAY_MODE_SHORTCUTS[e.key])
        return
      }

      switch (e.key.toLowerCase()) {
        case 'f':
          goToView?.('front')
          break
        case 't':
          goToView?.('top')
          break
        case 'i':
          goToView?.('iso')
          break
        case 'r':
          resetView?.()
          break
        case 'g':
          setShowGrid(!showGrid)
          break
        case 'm':
          toggleMeasureMode()
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    object,
    setDisplayMode,
    pipetteMode,
    exitPipetteMode,
    measureMode,
    exitMeasureMode,
    annotationMode,
    exitAnnotationMode,
    showHelp,
    setShowHelp,
    toggleHelp,
    goToView,
    resetView,
    showGrid,
    setShowGrid,
    toggleMeasureMode,
    pushToast,
    clearSelection,
    selectAll,
    invertSelection,
    openFilePicker,
  ])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)]">
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <ComponentTree />
        <main className="relative min-h-0 flex-1">
          <FileDropZone>
            <Viewer3D />
          </FileDropZone>
          <ModelInfoPanel />
          <MeasurementsPanel />
        </main>
        <AnimationPanel />
        <DimensionSheetPanel />
      </div>
      <ClippingPlane />
      <StatusBar />
      <ContextMenu />
      <PipetteCursor />
      <AnnotationPopup />
      <AnimationAssistant />
      <ToastHost />
      <HelpPanel />
      <PindiSourcePrompt />
      <CloseConfirmDialog />
      <GroupNameDialog />
      <InstallPrompt />
    </div>
  )
}

export default App
