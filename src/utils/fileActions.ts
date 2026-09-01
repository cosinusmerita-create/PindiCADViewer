import { useModelStore } from '../hooks/useModelState'
import { buildDimensionReport } from './dimensioning'
import { fetchAsDataUrl } from './imageUtils'
import { buildProjectFile, downloadTextFile, projectFileName, serializeProjectFile } from './projectFile'
import { generateTechnicalSheetPdf, type ViewCaptures } from './pdfExport'
import type { CameraState } from '../types/model'

export function baseName(fileName: string) {
  return fileName.replace(/\.[^./\\]+$/, '') || 'modele'
}

export function pdfFileName(fileName: string) {
  return `${baseName(fileName)}_fiche.pdf`
}

export function pngFileName(fileName: string, transparent: boolean) {
  return `${baseName(fileName)}_vue${transparent ? '_transparent' : ''}.png`
}

function waitTwoFrames(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

// A light background prints far better than the app's usual dark canvas, so
// the 4 view captures always use day mode regardless of what the user is
// actually looking at - switched on just for the capture and switched back
// immediately after, success or failure, so the user's own preference is
// never left changed by exporting a PDF.
export async function buildPdfBlobAndFile(fileName: string) {
  const state = useModelStore.getState()
  if (!state.tree || !state.captureFourViews) throw new Error('Aucun modèle chargé.')

  const previousTheme = state.theme
  if (previousTheme !== 'light') {
    state.setTheme('light')
    await waitTwoFrames()
  }

  try {
    const captures = (await state.captureFourViews()) as ViewCaptures
    const logoDataUrl = await fetchAsDataUrl(`${import.meta.env.BASE_URL}logo.png`)
    const report = buildDimensionReport(state.tree, state.edgeData, fileName)

    const doc = await generateTechnicalSheetPdf({
      fileName,
      projectName: state.projectName,
      dimensionReport: report,
      measurements: state.measurements,
      annotations: state.annotations,
      viewCaptures: captures,
      logoDataUrl,
    })

    const blob = doc.output('blob') as Blob
    const file = new File([blob], pdfFileName(fileName), { type: 'application/pdf' })
    return { doc, blob, file }
  } finally {
    if (previousTheme !== 'light') useModelStore.getState().setTheme(previousTheme)
  }
}

// Shared by the "Fichier" dropdown menu (FileMenu.tsx) and the Ctrl+S/Ctrl+P
// global keyboard shortcuts (App.tsx), pulled out into their own plain
// functions (reading store state via getState() rather than hooks) so
// neither entry point duplicates the actual save/export logic.
export function saveProjectFile(pushToast: (message: string) => void) {
  const state = useModelStore.getState()
  if (!state.tree || !state.fileName) return
  const camera: CameraState = state.getCameraState?.() ?? { position: [0, 0, 0], target: [0, 0, 0], zoom: 1 }
  const project = buildProjectFile({
    projectName: state.projectName,
    sourceFile: state.fileName,
    sourceFileHash: state.sourceFileHash ?? '',
    camera,
    displayMode: state.displayMode,
    colors: state.customColors,
    visibility: state.visibility,
    opacity: state.opacity,
    measurements: state.measurements,
    clippingEnabled: state.clippingEnabled,
    clippingAxis: state.clippingAxis,
    clippingPosition: state.clippingPosition,
    annotations: state.annotations,
  })
  // application/octet-stream, not application/json: some mobile download
  // managers rename the file to match a recognized MIME type's own default
  // extension, silently turning "xxx_session.pindi" into "...pindi.json" -
  // which then fails to open since the app routes by file extension.
  downloadTextFile(serializeProjectFile(project), projectFileName(state.fileName), 'application/octet-stream')
  useModelStore.getState().setHasUnsavedChanges(false)
  pushToast('Projet enregistré (.pindi)')
}

// Shared by the "Fichier" dropdown's "Fermer" item and the Ctrl+W global
// shortcut - closes immediately if the session has nothing unsaved, or
// raises the confirmation dialog (CloseConfirmDialog.tsx) otherwise, so
// neither entry point has to duplicate the unsaved-changes check.
export function requestCloseProject() {
  const state = useModelStore.getState()
  if (!state.object) return
  if (state.hasUnsavedChanges) state.setShowCloseConfirm(true)
  else state.clearModel()
}

export async function exportTechnicalPdf(pushToast: (message: string) => void) {
  const state = useModelStore.getState()
  if (!state.fileName) return
  try {
    const { doc } = await buildPdfBlobAndFile(state.fileName)
    doc.save(pdfFileName(state.fileName))
    pushToast('Fiche PDF exportée')
  } catch {
    pushToast("Échec de l'export PDF")
  }
}
