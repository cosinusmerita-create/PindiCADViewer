import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

const DISMISSED_STORAGE_KEY = 'pindi-install-dismissed'

// Not in the DOM lib yet (still a draft API) - just enough of the shape
// this component actually uses.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Chrome/Edge/Android fire 'beforeinstallprompt' when the page qualifies as
// an installable PWA (manifest + service worker + served over HTTPS/
// localhost) - capturing it is what lets an in-app button trigger the
// native install dialog later, since browsers refuse to show it from a
// stale/unsolicited call. Safari/iOS never fire this event at all (there's
// no programmatic install prompt there - "Ajouter à l'écran d'accueil" is
// share-sheet only), so this button simply never appears on iOS, which is
// expected rather than a bug to fix here.
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (window.localStorage.getItem(DISMISSED_STORAGE_KEY)) return

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setDeferredPrompt(null)

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!deferredPrompt) return null

  const handleInstall = async () => {
    await deferredPrompt.prompt()
    // A captured BeforeInstallPromptEvent can only ever be prompted once,
    // whichever way the user answers - nothing left to do with it either way.
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, '1')
    setDeferredPrompt(null)
  }

  return (
    <div className="fixed bottom-14 right-4 z-50 flex items-center gap-1 rounded-full bg-[var(--bg-active)] py-1 pl-4 pr-1.5 text-sm font-medium text-white shadow-xl">
      <button onClick={handleInstall} className="flex items-center gap-2 py-1.5">
        <Download size={15} /> Installer l'app
      </button>
      <button
        title="Ne plus proposer"
        onClick={handleDismiss}
        className="rounded-full p-1.5 text-white/70 hover:bg-white/15 hover:text-white"
      >
        <X size={13} />
      </button>
    </div>
  )
}
