import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useModelStore } from '../hooks/useModelState'

// Section titles/accent use --bg-active rather than the dimension-specific
// --dimension-linear blue, since --bg-active is the one accent color the
// theme keeps identical in both modes (#2563eb) - safe against a light
// panel background without needing its own light-mode variant.
const ACCENT = 'var(--bg-active)'

interface SectionDef {
  id: string
  label: string
}

const SECTIONS: SectionDef[] = [
  { id: 'import', label: "1. Importation d'un fichier CAO" },
  { id: 'interface', label: '2. Interface et navigation' },
  { id: 'display-modes', label: "3. Modes d'affichage" },
  { id: 'tree', label: '4. Arborescence et composants' },
  { id: 'colors', label: '5. Couleurs et transparence' },
  { id: 'clipping', label: '6. Plan de coupe dynamique' },
  { id: 'selection', label: '7. Sélection et surbrillance' },
  { id: 'measurements', label: '8. Mesures et Smart Snapping' },
  { id: 'auto-dimensions', label: '9. Fiche de cotes automatiques' },
  { id: 'animation', label: '10. Animation et déplacement' },
  { id: 'annotations', label: '11. Annotations' },
  { id: 'export', label: '12. Sauvegarde et export' },
  { id: 'flow', label: '13. Flux de fluide' },
  { id: 'ai-assistant', label: '14. Assistant IA' },
  { id: 'ai-commands', label: '15. Commandes IA' },
  { id: 'themes', label: '16. Thèmes' },
  { id: 'shortcuts', label: '17. Raccourcis clavier' },
  { id: 'faq', label: '18. Dépannage et FAQ' },
  { id: 'install', label: '19. Installation PWA et Desktop' },
]

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-lg font-bold" style={{ color: ACCENT }}>
      {children}
    </h2>
  )
}

function SubTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 mt-4 text-sm font-bold text-[var(--text-primary)] first:mt-0">{children}</h3>
  )
}

function Body({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[13px] leading-[1.6] text-[var(--text-secondary)]">{children}</p>
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mb-2 list-disc space-y-1 pl-5 text-[13px] leading-[1.6] text-[var(--text-secondary)]">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <div
      className="my-3 rounded-r border-l-[3px] border-[var(--bg-active)] bg-[var(--bg-hover)] p-3 text-[13px] leading-[1.6] text-[var(--text-secondary)]"
    >
      {children}
    </div>
  )
}

function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-[13px] text-[var(--text-secondary)]">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="border border-[var(--border-color)] bg-[var(--bg-active)] px-2 py-1.5 text-left font-semibold text-white"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-[var(--bg-modal)]' : 'bg-[var(--bg-hover)]'}>
              {row.map((cell, j) => (
                <td key={j} className="border border-[var(--border-color)] px-2 py-1.5 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="mb-3">
      <p className="text-sm font-bold text-[var(--text-primary)]">Q : {q}</p>
      <p className="mt-1 text-[13px] leading-[1.6] text-[var(--text-secondary)]">R : {a}</p>
    </div>
  )
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function HelpPanel() {
  const showHelp = useModelStore((s) => s.showHelp)
  const setShowHelp = useModelStore((s) => s.setShowHelp)
  const contentRef = useRef<HTMLDivElement>(null)
  const [activeId, setActiveId] = useState(SECTIONS[0].id)

  useEffect(() => {
    if (!showHelp) return
    const container = contentRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) setActiveId(visible[0].target.id)
      },
      // Shrinks the effective viewport to the top 30% of the scroll
      // container, so a section is marked active as soon as it crosses
      // into that band rather than needing to fill the whole panel.
      { root: container, rootMargin: '0px 0px -70% 0px', threshold: 0 },
    )

    const elements = SECTIONS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => el !== null)
    for (const el of elements) observer.observe(el)
    return () => observer.disconnect()
  }, [showHelp])

  if (!showHelp) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      onClick={() => setShowHelp(false)}
      style={{ animation: 'help-fade-in 0.2s ease-out' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-[90%] max-w-[800px] flex-col overflow-hidden rounded-xl border border-[var(--border-light)] bg-[var(--bg-modal)]"
        style={{ height: '90vh' }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-light)] px-4 py-3">
          <h1 className="text-base font-bold text-[var(--text-primary)]">Guide d'utilisation — PindiCADViewer</h1>
          <button
            title="Fermer"
            onClick={() => setShowHelp(false)}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="shrink-0 border-b border-[var(--border-light)] p-2 md:hidden">
          <select
            value={activeId}
            onChange={(e) => scrollToSection(e.target.value)}
            className="w-full rounded border border-[var(--border-light)] bg-[var(--bg-panel)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
          >
            {SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav className="hidden w-[200px] shrink-0 overflow-y-auto border-r border-[var(--border-light)] bg-[var(--bg-panel)] py-2 md:block">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                className={`block w-full px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--bg-hover)] ${
                  activeId === s.id ? 'font-semibold' : 'text-[var(--text-secondary)]'
                }`}
                style={
                  activeId === s.id
                    ? { backgroundColor: 'rgba(37,99,235,0.15)', color: 'var(--bg-active)' }
                    : undefined
                }
              >
                {s.label}
              </button>
            ))}
          </nav>

          <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <section id="import">
              <SectionTitle>1. Importation d'un fichier CAO</SectionTitle>
              <SubTitle>Formats supportés</SubTitle>
              <DataTable
                headers={['Format', 'Extension', 'Moteur', 'Précision']}
                rows={[
                  ['STEP/STP', '.step, .stp', 'occt-import-js (WASM)', 'Exacte (B-Rep)'],
                  ['STL', '.stl', 'Three.js STLLoader', 'Triangulée'],
                  ['OBJ', '.obj', 'Three.js OBJLoader', 'Triangulée'],
                  ['Projet Pindi', '.pindi', 'JSON natif', 'Session complète'],
                ]}
              />
              <SubTitle>Méthodes d'ouverture</SubTitle>
              <List
                items={[
                  <>
                    <strong className="text-[var(--text-primary)]">Glisser-déposer</strong> — Faites glisser un fichier depuis
                    l'explorateur directement sur la fenêtre. La zone de dépôt se met en surbrillance.
                  </>,
                  <>
                    <strong className="text-[var(--text-primary)]">Bouton "Ouvrir"</strong> — Bouton bleu en haut à gauche pour
                    parcourir vos fichiers.
                  </>,
                  <>
                    <strong className="text-[var(--text-primary)]">Fichier .pindi</strong> — Ouvrez un fichier de session pour
                    retrouver mesures, couleurs et annotations.
                  </>,
                ]}
              />
              <Tip>
                Astuce : le parsing STEP se fait dans un Web Worker dédié pour ne pas bloquer l'interface.
              </Tip>
            </section>

            <section id="interface" className="mt-8">
              <SectionTitle>2. Interface et navigation</SectionTitle>
              <SubTitle>Disposition de l'écran</SubTitle>
              <List
                items={[
                  <>
                    <strong className="text-[var(--text-primary)]">Toolbar (haut)</strong> — Boutons d'action principaux
                  </>,
                  <>
                    <strong className="text-[var(--text-primary)]">Panneau COMPOSANTS (gauche)</strong> — Arborescence des pièces
                  </>,
                  <>
                    <strong className="text-[var(--text-primary)]">Vue 3D (centre)</strong> — Zone principale avec gizmo XYZ
                  </>,
                  <>
                    <strong className="text-[var(--text-primary)]">Panneau d'infos (bas droite)</strong> — Nom, triangles,
                    dimensions
                  </>,
                  <>
                    <strong className="text-[var(--text-primary)]">Plan de coupe (bas)</strong> — Barre de contrôle de la section
                  </>,
                ]}
              />
              <SubTitle>Contrôles souris</SubTitle>
              <DataTable
                headers={['Action', 'Commande', 'Description']}
                rows={[
                  ['Rotation', 'Clic gauche + glisser', 'Orbite autour de la pièce'],
                  ['Pan', 'Clic droit + glisser', 'Déplace la vue'],
                  ['Zoom', 'Molette', 'Zoom avant/arrière'],
                  ['Sélection', 'Clic gauche', 'Sélectionne la pièce'],
                  ['Menu contextuel', 'Clic droit immobile', 'Transparence, masquer'],
                ]}
              />
              <SubTitle>Contrôles tactiles (mobile)</SubTitle>
              <DataTable
                headers={['Action', 'Geste', 'Description']}
                rows={[
                  ['Rotation', '1 doigt glisser', 'Orbite'],
                  ['Pan', '2 doigts glisser', 'Déplace'],
                  ['Zoom', 'Pincer/écarter', 'Zoom'],
                  ['Sélection', '1 tap', 'Sélectionne'],
                ]}
              />
              <SubTitle>Vues prédéfinies (7 boutons)</SubTitle>
              <Body>FA (Face), AR (Arrière), GA (Gauche), DR (Droite), DE (Dessus), SO (Dessous), ISO (Isométrique)</Body>
              <Body>
                Transition animée 300ms. Bouton "Réinitialiser la vue" recentre. Grille au sol toggle. Gizmo XYZ en
                bas à gauche.
              </Body>
            </section>

            <section id="display-modes" className="mt-8">
              <SectionTitle>3. Modes d'affichage</SectionTitle>
              <Body>6 modes via les icônes de la toolbar (raccourcis 1-6) :</Body>
              <DataTable
                headers={['Mode', 'Touche', 'Description']}
                rows={[
                  ['Ombré + arêtes', '1', 'Surfaces ombrées + arêtes noires (défaut)'],
                  ['Ombré', '2', 'Surfaces lisses sans arêtes'],
                  ['Filaire', '3', 'Lignes uniquement'],
                  ['Lignes cachées visibles', '4', 'Semi-transparent, toutes arêtes'],
                  ['Lignes cachées supprimées', '5', 'Surfaces blanches, arêtes visibles'],
                  ['Rendu réaliste', '6', 'Matériau physique avec reflets'],
                ]}
              />
            </section>

            <section id="tree" className="mt-8">
              <SectionTitle>4. Arborescence et composants</SectionTitle>
              <Body>Panneau COMPOSANTS (gauche, rétractable) :</Body>
              <List
                items={[
                  <>
                    <strong className="text-[var(--text-primary)]">Flèche</strong> — Déplier/replier les sous-assemblages
                  </>,
                  <>
                    <strong className="text-[var(--text-primary)]">Icône œil</strong> — Masquer/afficher une pièce
                  </>,
                  <>
                    <strong className="text-[var(--text-primary)]">Pastille couleur</strong> — Clic pour changer la couleur
                  </>,
                  <>
                    <strong className="text-[var(--text-primary)]">Icône goutte</strong> — Slider d'opacité (0 à 1)
                  </>,
                  <>
                    <strong className="text-[var(--text-primary)]">Clic sur le nom</strong> — Sélectionne avec surbrillance 3D
                  </>,
                  <>
                    <strong className="text-[var(--text-primary)]">Flèche de rétraction</strong> — Replier le panneau
                  </>,
                ]}
              />
            </section>

            <section id="colors" className="mt-8">
              <SectionTitle>5. Couleurs et transparence</SectionTitle>
              <SubTitle>Couleurs par défaut</SubTitle>
              <List
                items={[
                  'Pièce unique → Gris métallique (#b0b0b0)',
                  'Assemblage → Palette automatique de couleurs distinctes',
                  'Toggle "Couleurs par pièce" dans la toolbar',
                ]}
              />
              <SubTitle>Couleur personnalisée</SubTitle>
              <List
                items={[
                  <>
                    <strong className="text-[var(--text-primary)]">Color Picker</strong> — Sélectionnez une pièce, cliquez la
                    pastille
                  </>,
                  <>
                    <strong className="text-[var(--text-primary)]">Bouton ↺</strong> — Remet la couleur auto
                  </>,
                  <>
                    <strong className="text-[var(--text-primary)]">Réinitialiser toutes</strong> — Bouton toolbar
                  </>,
                ]}
              />
              <SubTitle>Outil Pipette</SubTitle>
              <List
                items={[
                  'Activez Pipette dans la toolbar',
                  'Premier clic = prélève la couleur',
                  'Clics suivants = applique aux autres pièces',
                  'Escape = quitter le mode',
                ]}
              />
              <SubTitle>Transparence</SubTitle>
              <List
                items={[
                  'Clic droit → "Transparent" (30%), "Opaque" (100%), "Masquer"',
                  'Slider dans l\'arborescence (icône goutte)',
                  'Bouton "Tout transparent" — Bascule tout à 30%',
                ]}
              />
            </section>

            <section id="clipping" className="mt-8">
              <SectionTitle>6. Plan de coupe dynamique</SectionTitle>
              <List
                items={[
                  'Cliquez "Coupe activée" dans la barre en bas',
                  'Choisissez l\'axe (X, Y, Z)',
                  'Déplacez le slider pour positionner le plan',
                  'La section est remplie (rendu solide, pas de vide)',
                  'Re-cliquez pour désactiver',
                ]}
              />
              <Tip>Astuce : combinez coupe + transparence pour voir l'intérieur d'un assemblage complexe.</Tip>
            </section>

            <section id="selection" className="mt-8">
              <SectionTitle>7. Sélection et surbrillance</SectionTitle>
              <SubTitle>Sélection bidirectionnelle</SubTitle>
              <List
                items={[
                  'Clic dans la vue 3D → contour orange + nom surligné dans l\'arbre',
                  'Clic dans l\'arbre → surbrillance dans la vue 3D',
                  'Désélection : clic dans le vide ou Escape',
                  'Infos affichées : nom, triangles, bounding box, couleur',
                ]}
              />
            </section>

            <section id="measurements" className="mt-8">
              <SectionTitle>8. Mesures et Smart Snapping</SectionTitle>
              <Body>Précision basée sur la topologie exacte du fichier STEP (B-Rep).</Body>
              <Body>Activation : Bouton Mesure (icône règle). Curseur en croix.</Body>
              <SubTitle>Accrochage intelligent au survol</SubTitle>
              <DataTable
                headers={['Entité', 'Couleur', 'Info affichée']}
                rows={[
                  ['Segment droit', 'Bleu', 'L = XX.XX mm'],
                  ['Cercle complet', 'Vert', 'Ø XX.XX mm + centre'],
                  ['Arc de cercle', 'Vert', 'R = XX.XX mm + angle'],
                  ['Surface cylindrique', 'Vert', 'Ø XX.XX mm (auto)'],
                  ['Congé/arrondi', 'Vert', 'R = XX.XX mm'],
                  ['Vertex', 'Orange', 'Coordonnées (X,Y,Z)'],
                ]}
              />
              <SubTitle>Mesure point-à-point</SubTitle>
              <List
                items={[
                  'Premier clic = marqueur rouge',
                  'Ligne pointillée dynamique',
                  'Deuxième clic = mesure figée avec cote et flèches',
                  'Distance totale + ΔX, ΔY, ΔZ',
                ]}
              />
              <SubTitle>Mesure diamètre/rayon</SubTitle>
              <List
                items={[
                  'Survolez une surface courbe → cercle vert + diamètre',
                  'Cliquez pour figer',
                  'Fonctionne aussi en cliquant à l\'intérieur d\'un trou',
                ]}
              />
              <Body>Gestion : bouton X par mesure, "Effacer toutes", Escape pour quitter.</Body>
            </section>

            <section id="auto-dimensions" className="mt-8">
              <SectionTitle>9. Fiche de cotes automatiques</SectionTitle>
              <Body>Bouton "Cotes auto" — génère toutes les dimensions :</Body>
              <List
                items={[
                  'Boîte d\'encombrement (L × l × H en mm) en pointillés bleu',
                  'Diamètres principaux (regroupés : "4× Ø 5.50 mm")',
                  'Entraxe / PCD des trous de fixation',
                  'Épaisseurs entre plans parallèles',
                ]}
              />
              <SubTitle>Panneau Fiche technique</SubTitle>
              <List
                items={[
                  "Dimensions d'encombrement",
                  'Liste des diamètres et rayons',
                  'Épaisseurs caractéristiques',
                  'Volume (cm³) et surface (cm²)',
                  'Export PDF et bouton Copier',
                ]}
              />
            </section>

            <section id="animation" className="mt-8">
              <SectionTitle>10. Animation et déplacement</SectionTitle>
              <Body>Panneau ANIMATION (visible quand une pièce est sélectionnée) :</Body>
              <SubTitle>Rotation continue</SubTitle>
              <List items={['Axes X, Y, Z (combinables)', 'Vitesse : 0.1 à 5 tours/s, sens horaire/anti-horaire']} />
              <SubTitle>Rotation par angle</SubTitle>
              <List items={['Angle en degrés + axe + durée (0.5s à 10s)']} />
              <SubTitle>Translation</SubTitle>
              <List items={['Axe + distance en mm + durée', 'Mode aller simple ou yoyo (boucle)']} />
              <SubTitle>Mode Présentation</SubTitle>
              <Body>Rotation lente axe Y (turntable).</Body>
              <SubTitle>Vue éclatée</SubTitle>
              <List items={['Bouton "Éclater" — sépare les pièces', 'Slider 0% (assemblé) à 100% (éclaté)']} />
              <Body>Contrôles : Play/Pause, Stop &amp; Reset.</Body>
            </section>

            <section id="annotations" className="mt-8">
              <SectionTitle>11. Annotations</SectionTitle>
              <List
                items={[
                  'Activez Annoter (icône bulle)',
                  'Cliquez sur le modèle → marqueur',
                  'Saisissez le texte (ex: "Alésage SKF 32009X")',
                  'Drapeau avec ligne de rappel, face caméra',
                  'Bouton X pour supprimer',
                  'Sauvegardées dans le .pindi',
                ]}
              />
            </section>

            <section id="export" className="mt-8">
              <SectionTitle>12. Sauvegarde et export</SectionTitle>
              <SubTitle>Enregistrer (.pindi)</SubTitle>
              <List
                items={[
                  'Sauvegarde caméra, couleurs, visibilité, mesures, annotations, coupe',
                  'Pour restaurer : ouvrir le .pindi puis le STEP source',
                ]}
              />
              <SubTitle>Export PDF</SubTitle>
              <List
                items={[
                  'Page 1 — Logo + 4 captures 3D (ISO, Face, Dessus, Droite)',
                  'Page 2 — Tableau dimensions, mesures, annotations, zone validation',
                ]}
              />
              <SubTitle>Capture PNG</SubTitle>
              <Body>Vue actuelle en haute résolution (fond transparent en option).</Body>
              <SubTitle>Partage</SubTitle>
              <Body>Web Share sur mobile, téléchargement sur desktop.</Body>
            </section>

            <section id="flow" className="mt-8">
              <SectionTitle>13. Flux de fluide</SectionTitle>
              <Body>
                Bouton <strong className="text-[var(--text-primary)]">Flux d'eau</strong> (icône vagues) dans la toolbar —
                visualise un écoulement (eau, huile ou air) traversant l'assemblage.
              </Body>
              <SubTitle>Tracer un parcours</SubTitle>
              <List
                items={[
                  'Activez le mode, puis cliquez sur le modèle pour poser des points de passage',
                  "Un clic près du bord d'un trou/alésage accroche automatiquement son centre exact",
                  "Si un passage traversant évident est détecté, une bannière propose Utiliser / Inverser / Suivant",
                  'Rappuyez sur un point déjà posé pour le "armer", puis cliquez ailleurs pour le repositionner',
                  <>
                    <strong className="text-[var(--text-primary)]">Point précis</strong> — ajoute un point par axe, distance
                    (mm) et angle par rapport au dernier point
                  </>,
                ]}
              />
              <SubTitle>Réglages</SubTitle>
              <List
                items={[
                  'Type de fluide : Eau (bleu), Huile (ambre), Air (flèches grises)',
                  'Trajectoire Linéaire (courbe lissée) ou Circulaire (cercle/hélice avec axe et nombre de tours)',
                  'Annuler point, Inverser le sens, Effacer pour repartir de zéro',
                  'Vitesse réglable une fois au moins 2 points placés',
                ]}
              />
              <Body>
                Bouton <strong className="text-[var(--text-primary)]">Lancer</strong> (dès 2 points) démarre une boucle animée
                continue ; les pièces passent temporairement à ~35% d'opacité pour voir l'écoulement à l'intérieur, puis
                reprennent leur opacité d'origine à l'arrêt.
              </Body>
              <Tip>Le parcours de fluide est un aide visuel temporaire - il n'est pas sauvegardé dans le fichier .pindi.</Tip>
            </section>

            <section id="ai-assistant" className="mt-8">
              <SectionTitle>14. Assistant IA</SectionTitle>
              <Body>
                Bouton <strong className="text-[var(--text-primary)]">IA</strong> dans la toolbar — ouvre un panneau de chat
                pour piloter la vue par commandes en français.
              </Body>
              <List
                items={[
                  'Boutons rapides : Éclater, Tourner, Présentation, Transparent, Reset, Couleur, Flux',
                  'Zone de texte libre pour décrire une action avec vos propres mots',
                  'Historique des messages conservé pendant la session (Effacer pour le vider)',
                ]}
              />
              <Tip>
                100% local : aucune requête réseau, aucune clé API. Les commandes sont interprétées directement dans le
                navigateur, ça fonctionne donc aussi hors-ligne (PWA installée).
              </Tip>
            </section>

            <section id="ai-commands" className="mt-8">
              <SectionTitle>15. Commandes IA</SectionTitle>
              <Body>Décrivez une action en français courant - pas besoin de syntaxe spéciale.</Body>
              <SubTitle>Exemples par catégorie</SubTitle>
              <DataTable
                headers={['Catégorie', 'Exemples']}
                rows={[
                  ['Sélection', '« Sélectionne les vis M5 », « Sélectionne tout », « Désélectionne tout »'],
                  ['Vue éclatée', '« Éclate toutes les pièces à 50% », « Remonte l\'assemblage »'],
                  ['Rotation', '« Fais tourner l\'arbre sur lui-même », « Tourne la flasque de 90° en Y »'],
                  ['Translation', '« Monte les vis de 50mm », « Descend la flasque de 40mm en 3 secondes »'],
                  ['Présentation', '« Lance une présentation lente de la pièce sélectionnée »'],
                  ['Démontage', '« Démonte l\'assemblage étape par étape » (pièces nommées vis/flasque/joint)'],
                  ['Couleur', '« Met la flasque_haut en rouge », « Colorie les vis en noir », « Même couleur que le tube »'],
                  ['Transparence', '« Rends le tube transparent », « Transparence à 30% »'],
                  ['Visibilité', '« Cache les vis », « Affiche toutes les pièces »'],
                  ['Flux', '« Trace le parcours de l\'eau dans l\'assemblage », « Arrête le flux »'],
                  ['Caméra', '« Vue de face », « Vue isométrique »'],
                  ['Réinitialiser', '« Arrête tout et remets en position initiale »'],
                ]}
              />
              <SubTitle>Combiner plusieurs actions</SubTitle>
              <Body>
                Une seule phrase peut enchaîner plusieurs étapes, séparées par une virgule, « puis » ou « et » :
              </Body>
              <List
                items={['« Sélectionne les vis M5, monte-les de 50mm et colorie-les en rouge »']}
              />
              <Tip>
                Si l'IA ne trouve pas une pièce, elle suggère les noms disponibles dans le modèle chargé. Précisez le nom
                exact si le résultat n'est pas celui attendu. Le zoom caméra, le plan de coupe et les mesures ne sont pas
                encore pilotables par commande IA - utilisez les outils dédiés de la toolbar pour ces actions.
              </Tip>
            </section>

            <section id="themes" className="mt-8">
              <SectionTitle>16. Thèmes</SectionTitle>
              <Body>Trois boutons dans la barre de statut (bas droite) :</Body>
              <List
                items={[
                  <>
                    <strong className="text-[var(--text-primary)]">Mode nuit</strong> — fond sombre, faible fatigue visuelle
                  </>,
                  <>
                    <strong className="text-[var(--text-primary)]">Mode jour</strong> — fond clair
                  </>,
                  <>
                    <strong className="text-[var(--text-primary)]">Mode classique</strong> — palette proche d'un logiciel CAO
                    traditionnel
                  </>,
                ]}
              />
              <Body>
                Le choix est mémorisé (localStorage) pour vos prochaines visites. Au tout premier chargement, sans
                préférence enregistrée, l'application respecte le réglage clair/sombre de votre système d'exploitation.
                Changer de thème réapplique aussi la palette de couleurs automatique des pièces qui n'ont pas de couleur
                personnalisée.
              </Body>
            </section>

            <section id="shortcuts" className="mt-8">
              <SectionTitle>17. Raccourcis clavier</SectionTitle>
              <DataTable
                headers={['Touche', 'Action']}
                rows={[
                  ['1-6', "Modes d'affichage"],
                  ['Escape', 'Désélectionner / Quitter mode'],
                  ['F', 'Vue Face'],
                  ['T', 'Vue Dessus'],
                  ['I', 'Vue Isométrique'],
                  ['R', 'Réinitialiser la vue'],
                  ['G', 'Toggle grille'],
                  ['M', 'Mode mesure'],
                  ['Ctrl+S', 'Enregistrer projet'],
                  ['Ctrl+P', 'Exporter PDF'],
                  ['? ou F1', "Ouvrir l'aide"],
                ]}
              />
            </section>

            <section id="faq" className="mt-8">
              <SectionTitle>18. Dépannage et FAQ</SectionTitle>
              <Faq
                q="Mon fichier STEP ne se charge pas"
                a="Vérifiez l'extension .step/.stp. Les fichiers >50 Mo prennent du temps. Un indicateur de chargement s'affiche."
              />
              <Faq
                q="Je ne peux pas tourner la pièce"
                a="Vous êtes peut-être en mode Mesure, Pipette ou Annotation. Appuyez sur Escape pour revenir au mode normal."
              />
              <Faq
                q="Le plan de coupe montre un vide"
                a="Rechargez la page. Essayez de changer d'axe puis revenez."
              />
              <Faq
                q="Les mesures ne sont pas précises"
                a="Utilisez le Smart Snapping (arêtes surlignées) plutôt que de cliquer sur les surfaces. Le snap utilise les données exactes STEP."
              />
              <Faq
                q="L'application est lente"
                a="Masquez les pièces non nécessaires. Désactivez le post-processing. Les assemblages >100 000 triangles peuvent ralentir."
              />
              <Faq
                q="Comment partager avec un collègue ?"
                a="Exportez un PDF. Pour une session interactive, envoyez le .pindi avec le STEP source."
              />
              <Faq
                q="Fonctionne sur téléphone ?"
                a="Oui, responsive avec gestes tactiles. Chrome/Safari mode paysage recommandé."
              />
              <Faq
                q="Comment changer entre mode jour et mode nuit ?"
                a="Cliquez l'icône soleil/lune dans la toolbar (à gauche du bouton Aide) pour basculer instantanément. Votre choix est mémorisé pour vos prochaines visites - au tout premier chargement, l'application respecte le réglage clair/sombre de votre système. L'export PDF utilise toujours le mode jour pour les captures, quel que soit le mode actif, puis revient automatiquement à votre mode."
              />
            </section>

            <section id="install" className="mt-8">
              <SectionTitle>19. Installation PWA et Desktop</SectionTitle>
              <SubTitle>Application web installable (PWA)</SubTitle>
              <List
                items={[
                  <>
                    Sur Chrome/Edge (Android ou ordinateur), un bouton <strong className="text-[var(--text-primary)]">« Installer
                    l'app »</strong> apparaît en bas à droite - cliquez dessus pour l'ajouter comme application autonome.
                  </>,
                  "Sur iPhone/iPad (Safari), ce bouton n'apparaît pas : utilisez Partager → Ajouter à l'écran d'accueil.",
                  "Une fois installée, l'application fonctionne hors-ligne (fichiers déjà ouverts, interface, assistant IA).",
                ]}
              />
              <SubTitle>Application desktop (Windows)</SubTitle>
              <List
                items={[
                  <>
                    <strong className="text-[var(--text-primary)]">Setup (installeur)</strong> — installe l'app avec raccourcis
                    Bureau/menu Démarrer et associe les fichiers .step/.stp/.stl/.pindi pour les ouvrir d'un double-clic
                  </>,
                  <>
                    <strong className="text-[var(--text-primary)]">Portable</strong> — aucune installation, se lance directement
                  </>,
                ]}
              />
              <Tip>
                La version desktop n'est pas publiée automatiquement en ligne - demandez le fichier .exe à la personne qui
                gère le projet, ou générez-le vous-même avec la commande de build Electron.
              </Tip>
            </section>

            <footer className="mt-8 border-t border-[var(--border-light)] pt-4 text-center text-xs text-[var(--text-muted)]">
              <p className="font-medium" style={{ color: ACCENT }}>
                PindiCADViewer — Puissance Mécanique et Précision 3D
              </p>
              <p className="mt-1">Projet Ferme Écologique Pindi — @fermeecopindi</p>
              <p>Contact : fermeecopindi@gmail.com — Août 2026</p>
            </footer>
          </div>
        </div>
      </div>
    </div>
  )
}
