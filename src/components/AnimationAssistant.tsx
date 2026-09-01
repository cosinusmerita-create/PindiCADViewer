import { useEffect, useRef, useState } from 'react'
import { Bot, MessageCircle, Send, Square, User, X } from 'lucide-react'
import { useModelStore } from '../hooks/useModelState'

const QUICK_COMMANDS = [
  { label: 'Éclater', text: 'Éclate toutes les pièces' },
  { label: 'Tourner', text: "Fais tourner la pièce sélectionnée sur elle-même" },
  { label: 'Présentation', text: 'Fais une présentation lente de la sélection' },
  { label: 'Transparent', text: 'Rends la sélection transparente' },
  { label: 'Reset', text: 'Arrête tout et remets en position initiale' },
  { label: 'Couleur', text: 'Change la couleur de ' },
  { label: 'Flux', text: 'Lance le flux du fluide tracé' },
]

// A fully local, rule-based command panel (see aiAssistant.ts) - no
// network call, no API key. This is a public static site (GitHub Pages /
// Electron, no backend server), so an Anthropic API key embedded in the
// client bundle would be visible to anyone opening dev tools; and the
// Anthropic API itself isn't meant to be called directly from a browser
// (no CORS support outside an explicit, explicitly-labeled-as-unsafe
// prototyping header). Wiring a real hosted LLM in later would need a
// small server-side proxy to hold the key - out of scope for this
// client-only build.
export function AnimationAssistant() {
  const object = useModelStore((s) => s.object)
  const aiChatOpen = useModelStore((s) => s.aiChatOpen)
  const toggleAiChat = useModelStore((s) => s.toggleAiChat)
  const messages = useModelStore((s) => s.aiChatMessages)
  const inputHistory = useModelStore((s) => s.aiChatInputHistory)
  const sendAiChatMessage = useModelStore((s) => s.sendAiChatMessage)
  const clearAiChat = useModelStore((s) => s.clearAiChat)
  const requestResetAll = useModelStore((s) => s.requestResetAll)
  const animations = useModelStore((s) => s.animations)
  const animationsPaused = useModelStore((s) => s.animationsPaused)
  const explodeFactor = useModelStore((s) => s.explodeFactor)
  const flowPlaying = useModelStore((s) => s.flowPlaying)

  const hasActiveAnimation =
    !animationsPaused &&
    (explodeFactor > 0 || flowPlaying || Object.values(animations).some((a) => a.continuousRotation.active || a.timed))

  const [input, setInput] = useState('')
  const [historyIndex, setHistoryIndex] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages])

  if (!aiChatOpen) return null

  const submit = (text: string) => {
    if (!text.trim()) return
    sendAiChatMessage(text)
    setInput('')
    setHistoryIndex(-1)
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex h-[400px] w-[350px] flex-col overflow-hidden rounded-xl border border-[var(--border-light)] bg-[var(--bg-panel)] shadow-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-light)] px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
          <Bot size={14} /> Assistant Animation IA
        </span>
        <button title="Fermer" onClick={toggleAiChat} className="text-slate-500 hover:text-slate-200">
          <X size={16} />
        </button>
      </div>

      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-2.5">
        {messages.length === 0 && (
          <p className="text-center text-xs text-slate-500">
            Décris ce que tu veux animer, par ex. « Éclate toutes les pièces » ou « Fais tourner l'arbre ».
          </p>
        )}
        {messages.map((m) =>
          m.role === 'system' ? (
            <p key={m.id} className="text-center text-[11px] text-slate-500">
              {m.text}
            </p>
          ) : (
            <div key={m.id} className={`flex items-end gap-1.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <span className="mb-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-slate-400">
                  <Bot size={12} />
                </span>
              )}
              <p
                className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-xs ${
                  m.role === 'user' ? 'bg-sky-500 text-white' : 'bg-[var(--bg-input)] text-[var(--text-secondary)]'
                }`}
              >
                {m.text}
              </p>
              {m.role === 'user' && (
                <span className="mb-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/30 text-sky-300">
                  <User size={12} />
                </span>
              )}
            </div>
          ),
        )}
      </div>

      {hasActiveAnimation && (
        <div className="flex shrink-0 items-center justify-between border-t border-[var(--border-light)] bg-white/5 px-3 py-1.5 text-[11px] text-slate-400">
          <span>Animation en cours…</span>
          <button
            onClick={() => requestResetAll()}
            className="flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-slate-300 hover:text-white"
          >
            <Square size={10} /> Stop
          </button>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-t border-[var(--border-light)] px-2 py-1.5">
        {QUICK_COMMANDS.map((q) => (
          <button
            key={q.label}
            onClick={() => setInput(q.text)}
            className="shrink-0 rounded-full bg-white/5 px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200"
          >
            {q.label}
          </button>
        ))}
        {messages.length > 0 && (
          <button
            onClick={clearAiChat}
            className="ml-auto shrink-0 rounded-full bg-white/5 px-2 py-1 text-[11px] text-slate-500 hover:text-slate-300"
          >
            Effacer
          </button>
        )}
      </div>

      <form
        className="flex shrink-0 items-center gap-1.5 border-t border-[var(--border-light)] p-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit(input)
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' && inputHistory.length > 0) {
              e.preventDefault()
              const nextIndex = Math.min(historyIndex + 1, inputHistory.length - 1)
              setHistoryIndex(nextIndex)
              setInput(inputHistory[nextIndex])
            }
          }}
          disabled={!object}
          placeholder={object ? 'Ex: Éclate les pièces sélectionnées...' : 'Charge un modèle pour commencer'}
          className="min-w-0 flex-1 rounded-md border border-[var(--border-light)] bg-[#0f0f1e] px-2 py-1.5 text-xs text-slate-200 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!object || !input.trim()}
          title="Envoyer"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sky-500 text-white transition-colors hover:bg-sky-400 disabled:pointer-events-none disabled:opacity-30"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  )
}

export function AnimationAssistantToggle() {
  const aiChatOpen = useModelStore((s) => s.aiChatOpen)
  const toggleAiChat = useModelStore((s) => s.toggleAiChat)
  const object = useModelStore((s) => s.object)

  return (
    <button
      title="Assistant Animation IA"
      onClick={toggleAiChat}
      disabled={!object}
      className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-30 ${
        aiChatOpen
          ? 'bg-[var(--bg-active)] text-white ring-2 ring-sky-300/70'
          : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
      }`}
    >
      <MessageCircle size={14} />
      <span className="hidden sm:inline">IA</span>
    </button>
  )
}
