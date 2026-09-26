import { useEffect, useState } from 'react'
import { Maximize, Minimize, RotateCcw, Scissors, Undo2 } from 'lucide-react'
import { useModelStore } from '../hooks/useModelState'
import { useToastStore } from '../hooks/useToastStore'
import { ToolButton } from './ToolButton'
import { toggleViewerFullscreen } from '../utils/fullscreen'

// Section plane, view reset, back to the opening state and fullscreen - used
// to sit in the bottom status bar, now grouped with the other toolbar actions
// (see Toolbar.tsx). "Réinitialiser les couleurs" moved to the Affichage group.
export function ViewActions() {
  const object = useModelStore((s) => s.object)
  const resetView = useModelStore((s) => s.resetView)
  const clippingPanelOpen = useModelStore((s) => s.clippingPanelOpen)
  const toggleClipping = useModelStore((s) => s.toggleClipping)
  const clippingEnabled = useModelStore((s) => s.clippingEnabled)
  const restoreOriginalState = useModelStore((s) => s.restoreOriginalState)
  const hasUnsavedChanges = useModelStore((s) => s.hasUnsavedChanges)
  const pushToast = useToastStore((s) => s.pushToast)
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement))

  // Stays in sync when fullscreen is left some way other than this button -
  // the Esc key, the browser's own "exit fullscreen" affordance.
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Destructive (drops every unsaved change), so it asks first - unless
  // nothing was modified, in which case there's nothing to lose.
  const handleRestoreOriginal = () => {
    if (hasUnsavedChanges && !window.confirm("Annuler toutes les modifications et revenir à l'état d'ouverture du modèle ?")) {
      return
    }
    restoreOriginalState()
    pushToast("Modèle remis à l'état d'ouverture")
  }

  return (
    <>
      <ToolButton
        icon={Scissors}
        label="Plan de coupe"
        title={clippingPanelOpen || clippingEnabled ? 'Retirer la coupe' : "Couper la pièce (réglages sous la barre d'outils)"}
        active={clippingPanelOpen || clippingEnabled}
        disabled={!object}
        onClick={toggleClipping}
      />
      <ToolButton icon={RotateCcw} label="Réinitialiser la vue" disabled={!object} onClick={() => resetView?.()} />
      <ToolButton
        icon={Undo2}
        label="État d'origine"
        title="Annuler toutes les modifications et remettre le modèle comme à l'ouverture"
        disabled={!object}
        onClick={handleRestoreOriginal}
      />
      <ToolButton
        icon={isFullscreen ? Minimize : Maximize}
        label={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
        title="Afficher uniquement la vue 3D en plein écran (Échap pour quitter)"
        active={isFullscreen}
        onClick={toggleViewerFullscreen}
      />
    </>
  )
}
