import type { ComponentNode, ViewPreset } from '../types/model'
import { collectPartNodeIds } from './componentTree'
import type { FlowFluidType } from './fluidTypes'

export type AiAxis = 'x' | 'y' | 'z'
export type AiTarget = 'all' | 'selected' | { keyword: string } | null

// A single leg of a described flow path - "entre par le manchon" is an
// `entry` waypoint on the part named "manchon", etc. Resolved into real 3D
// points against the live tree/topology by flowPathBuilder.ts.
export type FlowWaypointPoint = 'entry' | 'exit' | 'center'
export interface FlowWaypointSpec {
  keyword: string
  point: FlowWaypointPoint
}

export type AiIntent =
  | { kind: 'resetAll' }
  | { kind: 'explode'; factor: number; target: AiTarget }
  | { kind: 'rotateContinuous'; target: AiTarget; axis: AiAxis; speed: number; direction: 1 | -1 }
  | { kind: 'rotateAngle'; target: AiTarget; axis: AiAxis; angle: number; duration: number }
  | { kind: 'translate'; target: AiTarget; axis: AiAxis; distance: number; duration: number }
  | { kind: 'opacity'; target: AiTarget; opacity: number }
  | { kind: 'color'; target: AiTarget; color: string }
  | { kind: 'resetColor'; target: AiTarget }
  | { kind: 'resetAllColors' }
  | { kind: 'pipetteColor'; target: AiTarget; source: string }
  | { kind: 'visibility'; target: AiTarget; visible: boolean }
  | { kind: 'presentation'; target: AiTarget; speed: number }
  | { kind: 'cameraView'; view: ViewPreset }
  | { kind: 'flowPlay' }
  | { kind: 'flowStop' }
  | { kind: 'flowClear' }
  | { kind: 'flowSpeedChange'; speed: number }
  | { kind: 'flowPathTrace'; fluid: FlowFluidType; speed: number; waypoints: FlowWaypointSpec[] }
  | { kind: 'flowPathAuto'; fluid: FlowFluidType; speed: number; keyword: string | null }
  | { kind: 'disassembleSequence'; mode: 'demonte' | 'remonte' }
  | { kind: 'select'; target: AiTarget }
  | { kind: 'deselect' }
  | { kind: 'unknown' }

const COLOR_WORDS: Record<string, string> = {
  rouge: '#FF0000',
  bleu: '#0088FF',
  vert: '#00CC44',
  jaune: '#FFCC00',
  orange: '#FF8800',
  violet: '#8800CC',
  rose: '#FF66AA',
  blanc: '#FFFFFF',
  noir: '#222222',
  gris: '#888888',
  or: '#DAA520',
  dore: '#DAA520',
  argent: '#C0C0C0',
  bronze: '#CD7F32',
  acier: '#708090',
  cuivre: '#B87333',
}

// A material NAME maps to a different, more specific color than the same
// word used as a plain color (bronze the material reads warmer/duller
// than "bronze" the paint swatch above) - only consulted when the message
// is clearly about a material (mentions "materiau"/a material grade code),
// so a plain "mets le manchon en bronze" still uses the paint-swatch value.
const MATERIAL_COLOR_WORDS: Record<string, string> = {
  acier: '#708090',
  s355: '#708090',
  s235: '#708090',
  inox: '#C8C8D0',
  '316l': '#C8C8D0',
  '42crmo4': '#4A6680',
  bronze: '#B8860B',
  laiton: '#B8860B',
  caoutchouc: '#333333',
  joint: '#333333',
}

// Words that would otherwise get picked up as the "part name to search
// for" if they happen to be at least 3 letters long - verbs, articles and
// units the command itself is built from, not something a real part in
// the tree is ever named.
const STOPWORDS = new Set([
  'les',
  'des',
  'tous',
  'toutes',
  'tout',
  'met',
  'mets',
  'colore',
  'colorie',
  'applique',
  'appliquer',
  'peins',
  'peint',
  'peindre',
  'copie',
  'change',
  'changer',
  'fais',
  'faire',
  'monte',
  'montre',
  'descend',
  'tourne',
  'tourner',
  'eclate',
  'eclater',
  'seulement',
  'une',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'que',
  'pour',
  'avec',
  'dans',
  'sur',
  'vers',
  'axe',
  'degres',
  'secondes',
  'seconde',
  'pendant',
  'lente',
  'lentement',
  'rapide',
  'rapidement',
  'elle',
  'meme',
  'lui',
  'selection',
  'selectionnees',
  'selectionnee',
  'piece',
  'pieces',
  'transparent',
  'transparente',
  'opaque',
  'couleur',
  'position',
  'initiale',
  'remets',
  'arrete',
  'reset',
  // Verbs used as regex TRIGGERS elsewhere in this file - without these,
  // extractTargetKeyword would grab the verb itself as the fake "part
  // name" whenever it appears before the real target word (see memory:
  // "met"/"mets" had the exact same bug).
  'affiche',
  'cache',
  'masque',
  'rends',
  'rend',
  'deplace',
  'translate',
  'remonte',
  'remontage',
  'reassemble',
  'selectionne',
  'choisis',
  'prends',
  'demonte',
  'demontage',
  'desassemble',
  'retire',
  'sort',
  'enleve',
  'etape',
  'etapes',
  'pas',
])

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function extractNumber(text: string, unitPattern: string): number | null {
  const match = text.match(new RegExp(`(-?\\d+(?:[.,]\\d+)?)\\s*${unitPattern}`))
  if (!match) return null
  return parseFloat(match[1].replace(',', '.'))
}

function extractAxis(text: string): AiAxis | null {
  const match = text.match(/\baxe\s+([xyz])\b/) ?? text.match(/\bsur\s+l['’]?axe\s+([xyz])\b/)
  return (match?.[1] as AiAxis) ?? null
}

// "vers la gauche/droite/le haut/le bas/l'avant/l'arrière" - a signed
// axis, independent of any explicit "axe x/y/z" mention.
function extractDirection(text: string): { axis: AiAxis; sign: 1 | -1 } | null {
  if (/vers la gauche|a gauche/.test(text)) return { axis: 'x', sign: -1 }
  if (/vers la droite|a droite/.test(text)) return { axis: 'x', sign: 1 }
  if (/vers le haut|\bmonte\b|\bremonte\b/.test(text)) return { axis: 'y', sign: 1 }
  if (/vers le bas|\bdescend\b/.test(text)) return { axis: 'y', sign: -1 }
  if (/vers l['’]avant|en avant/.test(text)) return { axis: 'z', sign: 1 }
  if (/vers l['’]arriere|\brecule\b/.test(text)) return { axis: 'z', sign: -1 }
  return null
}

function extractFluid(text: string): FlowFluidType {
  if (/\bhuile\b/.test(text)) return 'oil'
  if (/\bair\b/.test(text)) return 'air'
  return 'water'
}

// Matches the 0.05-0.6 range of the real speed slider (see Toolbar.tsx) -
// "moyen" lands on the same default the manual tool starts with.
function extractFlowSpeed(text: string): number {
  if (/\brapide\b/.test(text)) return 0.4
  if (/\blente?\b/.test(text)) return 0.08
  return 0.15
}

// Words that would otherwise get picked up as the flow target keyword
// ("dans l'assemblage") but don't name any real part - treated as "no
// restriction, search the whole model" instead.
const FLOW_GENERIC_WORDS = new Set(['assemblage', 'ensemble', 'modele', 'piece', 'pieces', 'tout', 'toutes'])

function extractFlowAutoKeyword(text: string): string | null {
  const match = text.match(/\bdans\s+(?:l['’]|le |la |les )?([a-zàâäéèêëïîôöùûüç0-9' -]{3,})/)
  if (!match) return null
  const words = match[1].match(/[a-zàâäéèêëïîôöùûüç]{3,}/g) ?? []
  return words.find((w) => !STOPWORDS.has(w) && !FLOW_GENERIC_WORDS.has(w)) ?? null
}

// Best-effort "what part(s) is this about" - takes the first word (3+
// letters, not a stopword) since real part names in this app's trees
// (Vis, Flasque, Arbre, Manchon, Tube...) are exactly that kind of plain
// noun; actual matching against the tree happens later once the store's
// live `tree` is available (see useModelState.ts's sendAiChatMessage).
// Color/material words are excluded too - without this, a pronoun-only
// clause like "colorie-les en rouge" (no real part name, "-les" refers
// back to an earlier select step) would pick "rouge" itself as the fake
// target keyword instead of falling back to the current selection.
function extractTargetKeyword(text: string): string | null {
  const words = text.match(/[a-zàâäéèêëïîôöùûüç]{3,}/g) ?? []
  for (const word of words) {
    if (!STOPWORDS.has(word) && !(word in COLOR_WORDS) && !(word in MATERIAL_COLOR_WORDS)) return word
  }
  return null
}

// Same word right after "que"/"comme"/"de" in a "même couleur que X"
// phrasing - the pipette source part, not the target being colored.
function extractAfter(text: string, marker: RegExp): string | null {
  const match = text.match(marker)
  if (!match) return null
  const rest = match[1].match(/[a-zàâäéèêëïîôöùûüç0-9]{3,}/g) ?? []
  return rest.find((w) => !STOPWORDS.has(w)) ?? null
}

function extractTarget(text: string): AiTarget {
  if (/\bselection\b/.test(text)) return 'selected'
  // A specific noun always wins over a bare quantifier - "toutes les vis
  // M5" means "every screw named that", not literally every part in the
  // model (STOPWORDS already excludes "tout"/"toutes"/"tous" themselves).
  const keyword = extractTargetKeyword(text)
  if (keyword) return { keyword }
  if (/\b(tout|toutes|tous)\b/.test(text)) return 'all'
  return null
}

// A small, fully local rule-based parser - no network call, no API key,
// works offline. Deliberately NOT wired to a hosted LLM: this is a public
// static site (GitHub Pages / Electron, no backend), so any API key
// embedded in the client bundle would be visible to anyone who opens dev
// tools - see the chat response for the full explanation.
export function parseAiCommand(rawText: string): AiIntent {
  const text = stripAccents(rawText.toLowerCase())

  if (/\bremet.*position\b|\barrete tout\b|\breset\b/.test(text)) {
    return { kind: 'resetAll' }
  }

  const viewMatch = text.match(/vue (?:de |du )?(dessus|dessous|face|arriere|gauche|droite|iso)/)
  if (viewMatch) {
    const map: Record<string, ViewPreset> = {
      dessus: 'top',
      dessous: 'bottom',
      face: 'front',
      arriere: 'back',
      gauche: 'left',
      droite: 'right',
      iso: 'iso',
    }
    return { kind: 'cameraView', view: map[viewMatch[1]] }
  }

  if (/presentation|plateau tournant|turntable/.test(text)) {
    const speed = extractNumber(text, 'tours?') ?? (/lente|lentement/.test(text) ? 0.08 : /rapide/.test(text) ? 0.35 : 0.15)
    return { kind: 'presentation', target: extractTarget(text) ?? 'selected', speed }
  }

  if (/eclat/.test(text)) {
    const factor = (extractNumber(text, '%') ?? 70) / 100
    return { kind: 'explode', factor: Math.min(Math.max(factor, 0), 1), target: extractTarget(text) }
  }

  if (/(flux|ecoulement|fluide)\b/.test(text) && /lance|demarre|joue|simule/.test(text)) {
    return { kind: 'flowPlay' }
  }

  if (/arrete (le )?(flux|ecoulement)|stoppe (le )?(flux|ecoulement)/.test(text)) {
    return { kind: 'flowStop' }
  }
  if (/supprime (le )?(parcours|trajet)|efface (le )?(parcours|trajet|flux)/.test(text)) {
    return { kind: 'flowClear' }
  }
  if (/(change|regle|modifie)\s+la\s+vitesse/.test(text) && /(flux|ecoulement)/.test(text)) {
    return { kind: 'flowSpeedChange', speed: extractFlowSpeed(text) }
  }

  // "L'eau entre par le manchon, traverse le tube et sort par l'arbre" -
  // explicit waypoints always take priority over the generic auto-detect
  // trigger below, even if both phrasings appear in the same message.
  const waypointMatches = [
    ...text.matchAll(/(entre par|sort par|traverse)\s+([a-zàâäéèêëïîôöùûüç0-9' -]+?)(?=,|\.|;| et | puis | entre par| sort par| traverse|$)/g),
  ]
  if (waypointMatches.length > 0) {
    const waypoints: FlowWaypointSpec[] = []
    for (const m of waypointMatches) {
      const point: FlowWaypointPoint = m[1] === 'entre par' ? 'entry' : m[1] === 'sort par' ? 'exit' : 'center'
      const words = m[2].match(/[a-zàâäéèêëïîôöùûüç]{3,}/g) ?? []
      const keyword = words.find((w) => !STOPWORDS.has(w))
      if (keyword) waypoints.push({ keyword, point })
    }
    if (waypoints.length > 0) {
      return { kind: 'flowPathTrace', fluid: extractFluid(text), speed: extractFlowSpeed(text), waypoints }
    }
  }

  if (
    /trace (le )?(parcours|trajet)|montre le flux|affiche le flux|ajoute un flux|\b(flux|ecoulement)\s+d.(eau|air|huile)\b/.test(
      text,
    )
  ) {
    return { kind: 'flowPathAuto', fluid: extractFluid(text), speed: extractFlowSpeed(text), keyword: extractFlowAutoKeyword(text) }
  }

  if (/reinitialise toutes les couleurs|reset.*couleurs/.test(text)) {
    return { kind: 'resetAllColors' }
  }
  if (/reinitialise.*couleur/.test(text)) {
    return { kind: 'resetColor', target: extractTarget(text) ?? 'selected' }
  }

  const pipetteSource = extractAfter(text, /(?:meme couleur que|couleur (?:identique|comme) a)\s+(.+)$/)
  if (pipetteSource && /couleur/.test(text)) {
    // The target keyword sits BEFORE "même couleur que ..." - re-extract
    // from just that prefix so the source part's own name isn't picked up
    // as the target by mistake.
    const prefix = text.slice(0, text.indexOf(pipetteSource))
    return { kind: 'pipetteColor', target: extractTarget(prefix) ?? 'selected', source: pipetteSource }
  }

  // A material name (mentioned alongside "matériau", or one of the grade
  // codes that's never a plain color word) maps to its own dedicated
  // color, not the plain paint-swatch one - see MATERIAL_COLOR_WORDS.
  const materialWord = Object.keys(MATERIAL_COLOR_WORDS)
    .sort((a, b) => b.length - a.length)
    .find((word) => new RegExp(`\\b${word}\\b`).test(text))
  if (materialWord && (/materiau/.test(text) || !(materialWord in COLOR_WORDS))) {
    return { kind: 'color', target: extractTarget(text) ?? { keyword: materialWord }, color: MATERIAL_COLOR_WORDS[materialWord] }
  }

  const hexHashMatch = rawText.match(/#[0-9a-fA-F]{3,6}\b/)
  // A bare hex code with no leading # (e.g. "FF0000") is only accepted right
  // after the word "couleur" - otherwise plenty of ordinary French words
  // (e.g. "facade") are themselves valid 6-digit hex and would false-positive.
  const hexBareMatch = rawText.match(/couleur\s+([0-9a-fA-F]{6})\b/i)
  const hexMatch = hexHashMatch ? hexHashMatch[0] : hexBareMatch ? `#${hexBareMatch[1]}` : null
  const colorWord = Object.keys(COLOR_WORDS).find((word) => new RegExp(`\\b${word}\\b`).test(text))
  // "colorie" (imperative "colorie les vis") is a DIFFERENT substring from
  // "colore" - both are real verb forms used across the guide, so both
  // need their own alternative here rather than relying on one to contain
  // the other.
  if (hexMatch || (colorWord && /couleur|colorie|colore|mets?\b|peins?\b|applique\b/.test(text))) {
    const hex = hexMatch ?? COLOR_WORDS[colorWord!]
    return { kind: 'color', target: extractTarget(text) ?? 'selected', color: hex }
  }

  if (/transparent|opacite|transparence/.test(text)) {
    const pct = extractNumber(text, '%')
    const opacity = pct !== null ? pct / 100 : /opaque/.test(text) ? 1 : 0.3
    return { kind: 'opacity', target: extractTarget(text) ?? 'selected', opacity: Math.min(Math.max(opacity, 0), 1) }
  }

  if (/\bcache\b|\bmasque\b/.test(text)) {
    return { kind: 'visibility', target: extractTarget(text) ?? 'selected', visible: false }
  }
  if (/\baffiche\b|\bmontre\b/.test(text)) {
    return { kind: 'visibility', target: extractTarget(text) ?? 'selected', visible: true }
  }

  const angle = extractNumber(text, '(?:deg|°|degres?)')
  if (angle !== null && /tourn/.test(text)) {
    const duration = extractNumber(text, '(?:s|sec|secondes?)') ?? 2
    return { kind: 'rotateAngle', target: extractTarget(text) ?? 'selected', axis: extractAxis(text) ?? 'y', angle, duration }
  }

  if (/tourn.*(sur elle.?meme|sur lui.?meme)|rotation continue|fait[\s-]*(le|la|les)?[\s-]*tourner|fais[\s-]*(le|la|les)?[\s-]*tourner/.test(text)) {
    const speed = extractNumber(text, 'tours?') ?? (/lente|lentement/.test(text) ? 0.15 : /rapide/.test(text) ? 1.5 : 0.5)
    return {
      kind: 'rotateContinuous',
      target: extractTarget(text) ?? 'selected',
      axis: extractAxis(text) ?? 'y',
      speed,
      direction: 1,
    }
  }

  // "vers la gauche/droite/le haut/le bas/l'avant/l'arrière" maps directly
  // onto a signed X/Y/Z axis - see MAPPING DES TERMES UTILISATEUR ci-dessus.
  const direction = extractDirection(text)
  const distance = extractNumber(text, 'mm')
  if ((distance !== null || direction) && /\b(monte|descend|deplace|translate|remonte|retire|sort|enleve)\b/.test(text)) {
    const duration = extractNumber(text, '(?:s|sec|secondes?)') ?? 2
    const axis = extractAxis(text) ?? direction?.axis ?? 'y'
    // No explicit "Nmm" given ("Retire les vis vers le haut") - a sensible
    // default travel distance, signed by whichever direction word matched.
    const magnitude = distance !== null ? Math.abs(distance) : 50
    const signed = direction ? magnitude * direction.sign : /\bdescend\b/.test(text) ? -magnitude : magnitude
    return { kind: 'translate', target: extractTarget(text) ?? 'selected', axis, distance: signed, duration }
  }

  // Checked BEFORE the plain "select" trigger below - "deselectionne"
  // contains "selectionne" as a substring, so without this the opposite
  // command ("Désélectionne tout") would silently get parsed as SELECTing
  // everything instead of clearing the selection.
  if (/deselectionne/.test(text)) {
    return { kind: 'deselect' }
  }

  const target = extractTarget(text)
  if (target && /selectionne|choisis|prends/.test(text)) {
    return { kind: 'select', target }
  }

  return { kind: 'unknown' }
}

// First word of each clause that should start a NEW step when it follows
// " et "/","/" puis " in a combined command ("Sélectionne les vis, monte-
// les de 50mm et colorie-les en rouge") - without this, splitting on every
// "et" would also break apart plain target lists ("le manchon et le tube").
const CLAUSE_ACTION_START =
  /^(mets?|colorie?|colore|applique|peins?|rends?|cache|masque|affiche|montre|eclate|tourne|fais|rotation|monte|descend|deplace|bouge|pousse|retire|recule|selectionne|deselectionne|choisis|prends|demonte|remonte|arrete|stop|reset|remets|trace|efface|supprime|accelere|ralentis|inverse|change|zoom|rapproche|coupe|active|desactive|mesure|donne|vue)\b/

// Splits one raw message into separate command clauses on ","/";"/" puis "
// (always) and on " et " (only when the word right after it is itself a
// known action verb - otherwise "et" is just joining a target list and the
// clause is left untouched).
function splitAiClauses(rawText: string): string[] {
  const roughParts = rawText.split(/,|;|\bpuis\b/i)
  const clauses: string[] = []
  for (const part of roughParts) {
    const pieces = part.split(/\bet\b/i)
    let current = pieces[0] ?? ''
    for (let i = 1; i < pieces.length; i++) {
      const piece = pieces[i]
      const probe = stripAccents(piece.trim().toLowerCase())
      if (CLAUSE_ACTION_START.test(probe)) {
        clauses.push(current)
        current = piece
      } else {
        current += ' et ' + piece
      }
    }
    clauses.push(current)
  }
  return clauses.map((c) => c.trim()).filter(Boolean)
}

// Expands one user message into an ORDERED sequence of intents: any
// command naming a specific target ("les vis M5", "l'arbre", "toutes les
// vis") is split into an explicit `select` step followed by the real
// action retargeted at `selected` - so the user sees/feels the assistant
// select the pieces first, exactly like doing it by hand, and the 3D view
// highlights them before the action runs. A bare command with no
// specific target (already "selected"/generic) stays a single step.
// "Démonte/remonte ... étape par étape" is recognized here but actually
// expanded against the live tree in useModelState.ts (needs to check
// which named parts really exist in the loaded model).
export function parseAiPlan(rawText: string): AiIntent[] {
  const text = stripAccents(rawText.toLowerCase())

  if (/etape par etape|pas a pas/.test(text)) {
    if (/demonte|demontage|desassemble/.test(text)) return [{ kind: 'disassembleSequence', mode: 'demonte' }]
    if (/remonte|remontage|reassemble/.test(text)) return [{ kind: 'disassembleSequence', mode: 'remonte' }]
  }

  // A single message can describe several steps at once ("Sélectionne les
  // vis M5, monte-les de 50mm et colorie-les en rouge") - each clause is
  // parsed independently, and any clause naming a specific target gets its
  // own explicit `select` step first, exactly like the single-command case
  // below used to.
  const plan: AiIntent[] = []
  for (const clause of splitAiClauses(rawText)) {
    const intent = parseAiCommand(clause)
    if (intent.kind === 'unknown') continue
    if (intent.kind !== 'select' && 'target' in intent && intent.target && intent.target !== 'selected') {
      plan.push({ kind: 'select', target: intent.target }, { ...intent, target: 'selected' } as AiIntent)
    } else {
      plan.push(intent)
    }
  }
  return plan.length > 0 ? plan : [{ kind: 'unknown' }]
}

export interface ResolvedAiTarget {
  ids: string[]
  label: string
}

// Ignores underscores/hyphens/spaces on top of accents/case, so a keyword
// like "vis" or "flasque haut" matches real CAD export names regardless
// of how they're separated ("Vis_M5_001", "flasque-haut", "FlasqueHaut").
function normalizeName(s: string): string {
  return stripAccents(s.toLowerCase()).replace(/[_\-\s]+/g, '')
}

// Turns a parsed AiTarget into real node ids against the live tree - kept
// separate from parseAiCommand itself so the parser stays a pure text->
// intent function with no tree dependency (easier to reason about/test).
export function resolveAiTarget(tree: ComponentNode, selectedNodeIds: string[], target: AiTarget): ResolvedAiTarget {
  if (target === 'all') return { ids: collectPartNodeIds(tree), label: 'toutes les pièces' }
  if (target === 'selected' || target === null) return { ids: selectedNodeIds, label: 'la sélection actuelle' }

  const allNodes: { id: string; name: string }[] = []
  const visitAll = (node: ComponentNode) => {
    allNodes.push({ id: node.id, name: node.name })
    for (const child of node.children) visitAll(child)
  }
  visitAll(tree)

  const findMatches = (keyword: string): string[] => {
    const normKeyword = normalizeName(keyword)
    return allNodes.filter(({ name }) => normalizeName(name).includes(normKeyword)).map((n) => n.id)
  }

  const keyword = target.keyword.toLowerCase()
  // A French plural ("les joints") won't substring-match a singular part
  // name ("joint 45x62x7") - retry once with a trailing "s" stripped
  // before giving up.
  let matches = findMatches(keyword)
  if (matches.length === 0 && keyword.endsWith('s') && keyword.length > 3) matches = findMatches(keyword.slice(0, -1))

  if (matches.length === 0) {
    // Helps the user fix a typo/wrong name instead of a dead end - any
    // part whose normalized name shares the keyword's first 3 characters
    // is a plausible near-miss to suggest instead.
    const prefix = normalizeName(keyword).slice(0, 3)
    const suggestions = Array.from(new Set(allNodes.map((n) => n.name))).filter((name) => normalizeName(name).includes(prefix))
    const suggestionText = suggestions.length > 0 ? ` - pièces disponibles : ${suggestions.slice(0, 5).join(', ')}` : ''
    return { ids: [], label: `« ${target.keyword} » (0 pièce trouvée${suggestionText})` }
  }

  return { ids: matches, label: `« ${target.keyword} » (${matches.length} pièce${matches.length > 1 ? 's' : ''} trouvée${matches.length > 1 ? 's' : ''})` }
}
