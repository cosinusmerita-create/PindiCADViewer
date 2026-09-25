// Fullscreens ONLY the 3D stage (canvas + its overlays), hiding the toolbar,
// component tree and other panels. Esc leaves fullscreen natively - the
// browser/Electron handle that key themselves.
export function toggleViewerFullscreen() {
  if (!document.fullscreenElement) document.getElementById('viewer-stage')?.requestFullscreen?.()
  else document.exitFullscreen?.()
}
