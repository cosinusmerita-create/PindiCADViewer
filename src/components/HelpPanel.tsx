import { useEffect, useRef, useState, type ReactNode } from 'react'
import { GEOMETRY_FORMATS, SOLIDWORKS_BRIDGE_FORMATS } from '../utils/formats'
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
  { id: 'explode-collision', label: '11. Vue éclatée et collision' },
  { id: 'annotations', label: '12. Annotations' },
  { id: 'export', label: '13. Sauvegarde et export' },
  { id: 'flow', label: '14. Flux de fluide' },
  { id: 'ai-assistant', label: '15. Assistant IA' },
  { id: 'ai-commands', label: '16. Commandes IA' },
  { id: 'themes', label: '17. Thèmes' },
  { id: 'shortcuts', label: '18. Raccourcis clavier' },
  { id: 'faq', label: '19. Dépannage et FAQ' },
  { id: 'install', label: '20. Installation PWA et Desktop' },
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
                  ...GEOMETRY_FORMATS.map((f) => [f.label, f.extensions.map((e) => `.${e}`).join(', '), f.engine, f.precision]),
                  ['Projet Pindi', '.pindi', 'JSON natif', 'Session complète'],
                ]}
              />
              <SubTitle>Formats propriétaires (version bureau, via SOLIDWORKS)</SubTitle>
              <List
                items={[
                  "Ces formats n'ont pas de lecteur libre : la version bureau les fait ouvrir par le SOLIDWORKS installé sur le poste (lecture seule), qui en exporte une copie STEP (pièces, assemblages) ou DXF (mises en plan), puis l'affiche ici",
                  'SOLIDWORKS doit être lancé ; un document déjà ouvert dans SOLIDWORKS reste ouvert, les autres sont refermés après conversion. La version web ne peut pas les ouvrir',
                  "Un import peut s'arrêter sur une fenêtre de SOLIDWORKS (pièces référencées introuvables…) : au-delà de 10 minutes, l'ouverture est abandonnée avec un message",
                  'DXF sans unités déclarées ($INSUNITS) : les cotes sont lues en millimètres',
                ]}
              />
              <DataTable
                headers={['Format', 'Extensions']}
                rows={SOLIDWORKS_BRIDGE_FORMATS.map((f) => [f.label, f.extensions.map((e) => `.${e}`).join(', ')])}
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
              <SubTitle>Qualité STEP et temps d'ouverture</SubTitle>
              <Body>
                Sur l'écran d'accueil, le menu <strong className="text-[var(--text-primary)]">Qualité STEP</strong> règle la
                finesse du maillage avant d'ouvrir un fichier. Plus il est fin, plus l'ouverture est longue. Le choix est
                mémorisé.
              </Body>
              <DataTable
                headers={['Qualité', 'Quand l\'utiliser', 'Exemple (assemblage de 61 pièces, 5 Mo)']}
                rows={[
                  ['Standard (rapide)', 'Usage courant, recommandé', '≈ 30 s, 90 000 triangles'],
                  ['Fin', 'Cotes plus fidèles sur les cylindres', '≈ 40 s, 224 000 triangles'],
                  ['Très précis (lent)', 'Cotes au centième de mm', 'Plusieurs minutes sur un gros assemblage'],
                ]}
              />
              <SubTitle>Réouverture rapide (cache)</SubTitle>
              <Body>
                Après la première ouverture d'un fichier STEP, son maillage est mémorisé sur votre ordinateur. Rouvrir le
                même fichier (même contenu, même qualité) ne prend plus que quelques secondes, et le message « Ouverture
                rapide : modèle chargé depuis le cache » s'affiche. Le cache garde les 6 derniers modèles ; le menu
                <strong className="text-[var(--text-primary)]"> Fichier → Vider le cache des modèles</strong> le supprime.
              </Body>
              <Tip>
                Astuce : le parsing STEP se fait dans un Web Worker dédié pour ne pas bloquer l'interface. Pendant le
                chargement, le temps écoulé s'affiche. Pour changer de qualité, fermez le projet (clic sur le logo) puis
                rouvrez le fichier.
              </Tip>
            </section>

            <section id="interface" className="mt-8">
              <SectionTitle>2. Interface et navigation</SectionTitle>
              <SubTitle>Disposition de l'écran</SubTitle>
              <List
                items={[
                  <>
                    <strong className="text-[var(--text-primary)]">Barre de menus (tout en haut)</strong> — Le logo, suivi des
                    menus Fichier, Affichage (modes d'affichage, grille, plein écran, thème) et Aide (guide, site web, à
                    propos). Un clic sur le logo revient à l'écran d'accueil. Dans l'application desktop, cette barre remplace
                    la barre de titre de Windows (les boutons réduire/agrandir/fermer restent à droite)
                  </>,
                  <>
                    <strong className="text-[var(--text-primary)]">Barre d'outils, sur 3 lignes</strong> — Ligne 1 :
                    Ouvrir, modes d'affichage, vues FA à ISO, puis Réinitialiser la vue, État d'origine, Plan de
                    coupe, Réinitialiser les couleurs et Plein écran. Ligne 2 : tous les outils, rangés par groupe (Outils,
                    Affichage, Assemblage, Simulation). Ligne 3 : les options de l'outil actif, visible seulement quand un
                    outil est en cours
                  </>,
                  <>
                    <strong className="text-[var(--text-primary)]">Réglages du plan de coupe</strong> — Ils s'affichent sous
                    la barre d'outils quand vous cliquez sur « Plan de coupe », qui coupe aussitôt la pièce
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
                    <strong className="text-[var(--text-primary)]">Barre de statut (bas)</strong> — Nom du fichier, nombre de
                    triangles et choix du thème
                  </>,
                ]}
              />
              <Body>Sur écran étroit ou mobile, les groupes passent à la ligne et les boutons n'affichent plus que leur icône.</Body>
              <SubTitle>Actions de vue</SubTitle>
              <List
                items={[
                  <>
                    <strong className="text-[var(--text-primary)]">Réinitialiser la vue</strong> — recentre la caméra
                  </>,
                  <>
                    <strong className="text-[var(--text-primary)]">État d'origine</strong> — annule TOUTES les modifications et
                    remet le modèle comme à son ouverture : positions des pièces, éclatement, animations, couleurs,
                    transparence, pièces masquées, groupes, plan de coupe, mesures, annotations, cotes, flux, outil Collision,
                    sélection et caméra. Une confirmation est demandée s'il y a des modifications non enregistrées. Le thème,
                    la grille et la qualité STEP ne sont pas modifiés
                  </>,
                  <>
                    <strong className="text-[var(--text-primary)]">Réinitialiser les couleurs</strong> — supprime les couleurs
                    personnalisées
                  </>,
                  <>
                    <strong className="text-[var(--text-primary)]">Plein écran</strong> — affiche uniquement la vue 3D sur tout
                    l'écran (barre d'outils et panneaux masqués). Appuyez sur Échap pour quitter
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
              <SubTitle>Outils de navigation (après VUES, comme dans SOLIDWORKS / eDrawings)</SubTitle>
              <List
                items={[
                  'Sélectionner : clic = sélection d’une pièce, glisser = rotation (fonctionnement habituel)',
                  'Translater : glisser avec le bouton gauche déplace la vue ; un clic ne sélectionne rien',
                  'Rotation : glisser avec le bouton gauche fait tourner la vue ; un clic ne sélectionne rien',
                  'Zoom : glisser vers le haut / le bas avec le bouton gauche pour zoomer ; un clic ne sélectionne rien',
                  'Zoom fenêtre : tracez un rectangle, la vue zoome sur cette zone puis l’outil précédent revient (Échap pour annuler)',
                  'Zoom ajusté (touche Z) : cadre tout le modèle visible (pièces masquées exclues) sans changer l’orientation',
                  'Dans tous les modes : clic droit glissé = déplacer, molette = zoomer. Les outils Mesure, Pipette, Annoter… restent prioritaires',
                ]}
              />
              <Body>
                Transition animée 300ms. Bouton "Réinitialiser la vue" recentre. À chaque ouverture, la pièce est posée sur une grille centrée sous elle ; bouton Grille (touche G) pour la masquer. Gizmo XYZ en
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
                  ['Rendu réaliste', '6', 'Matériau physique avec reflets, ombres et ombre portée au sol ; fonctionne hors connexion'],
                ]}
              />
              <SubTitle>Lumières et caméra</SubTitle>
              <List
                items={[
                  "Bouton « Lumières et caméra » (groupe Affichage) : un panneau s'ouvre en haut à droite de la vue 3D, avec deux onglets",
                  'Lumières : préréglages Par défaut, Studio, Doux, Contrasté (fait ressortir les reliefs), Atelier (lumière chaude) et Frontale ; puis intensité, direction (tourner autour, hauteur) et teinte de la lumière principale, lumière d’appoint et lumière ambiante. Toute retouche passe en « Personnalisé »',
                  '« Lampe frontale » : la lumière tourne avec la caméra, la face regardée reste éclairée ; la direction se règle alors par rapport à la vue',
                  'Caméra : tourner autour de la pièce, hauteur, distance et angle de vue (petit angle = presque sans perspective) ; les curseurs suivent aussi la souris',
                  'Coordonnées exactes de la caméra et du point visé (mm, validez avec Entrée) ; « Viser la pièce » ou « Viser la sélection » recentre sans changer l’angle',
                  'Vues mémorisées : nommez puis « Mémoriser » ; un clic sur le nom y revient. Éclairage, angle de vue et vues mémorisées sont enregistrés dans le .pindi',
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
              <Body>
                Quand le fichier ne donne pas de nom à ses pièces (ou seulement « Pièce 1, Pièce 2… »), l'application les
                nomme d'après leur forme : « Pale · 1, Pale · 2, Pale · 3 », « Disque », « Plaque », « Tige Ø20 × 429 »…
                Les pièces identiques sont numérotées, et les dimensions ne sont ajoutées que si deux formes différentes
                portent le même nom. Les noms présents dans le fichier sont toujours conservés.
              </Body>
              <SubTitle>Renommer une pièce ou un groupe</SubTitle>
              <List
                items={[
                  'Double-clic sur le nom dans la liste (ou clic droit sur la ligne ou sur la pièce → « Renommer »), tapez le nouveau nom puis Entrée ; Échap annule',
                  'Le nouveau nom apparaît partout : liste, fenêtre de sélection, fiche de cotes, commandes IA',
                  'Les noms choisis sont enregistrés dans le fichier .pindi ; « État d’origine » remet les noms du fichier',
                ]}
              />
              <SubTitle>Grouper des pièces</SubTitle>
              <List
                items={[
                  'Sélectionnez plusieurs pièces : Ctrl+clic pour en ajouter ou retirer une, Maj+clic pour une plage, ou l’outil « Sélection rectangle »',
                  'Cliquez sur « Grouper » (groupe Assemblage, actif dès 2 pièces sélectionnées) et donnez un nom : les pièces sont réunies dans un dossier de l’arborescence',
                  'Le groupe se sélectionne, se colore, se masque et s’anime comme une seule pièce (voir section 10) - fini de recocher chaque pièce',
                  'Clic droit sur le dossier (dans la liste ou dans la vue 3D) → « Dissocier » : les pièces reviennent à la racine, sans perdre leurs couleurs ni leurs réglages',
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
                  'Toggle "Couleurs par pièce" dans la toolbar : les pièces de même forme et de mêmes dimensions (4 vis identiques, 3 pales identiques...) reçoivent la MÊME couleur, quelle que soit leur position ou leur orientation',
                  'Bouton "Couleur aléatoire" (à droite de "Couleurs par pièce", actif seulement quand celui-ci l’est) : chaque clic tire une nouvelle série de couleurs au hasard - les pièces identiques gardent la même couleur, et les couleurs choisies à la main ne changent pas. Cliquez jusqu’à trouver la série qui vous plaît : elle est enregistrée dans le fichier .pindi',
                  "Pièce seule (STEP, IGES, BREP) : le bouton devient \"Couleurs par face\" - chaque face de la pièce reçoit sa couleur (un perçage compte pour une seule face), pour mieux lire sa forme ; \"Couleur aléatoire\" tire alors de nouvelles couleurs de faces. Une couleur choisie à la main (pipette, pastille) recouvre toute la pièce ; le bouton ↺ remet les couleurs de faces",
                  'Pièce seule sans faces CAO (STL, OBJ) : "Couleurs par pièce" lui donne une couleur, et "Couleur aléatoire" en tire une autre à chaque clic',
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
                    <strong className="text-[var(--text-primary)]">Réinitialiser les couleurs</strong> — Bouton de la toolbar (ligne 1)
                  </>,
                ]}
              />
              <SubTitle>Outil Pipette</SubTitle>
              <List
                items={[
                  'Activez Pipette dans la toolbar : une barre de couleurs apparaît sous les outils',
                  'Choisissez la couleur : une pastille de la palette rapide, le « Nuancier » (tableau de toutes les teintes, du plus clair au plus foncé, plus les gris), ou le grand carré pour une couleur libre',
                  '« Adoucir » (0 à 100 %) rend la couleur moins vive et plus claire en gardant sa teinte ; le carré montre la couleur réellement peinte, et les pastilles comme le nuancier s’affichent déjà adoucis',
                  'Cliquez sur les pièces à peindre (fonctionne aussi avec une seule pièce) ; clic sur une pièce sélectionnée = toute la sélection',
                  'La couleur choisie est gardée pour la prochaine utilisation',
                  'Escape ou clic droit = quitter le mode',
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
                  "Cliquez sur le bouton « Plan de coupe » (ciseaux) dans la barre d'outils : la pièce est coupée aussitôt, au milieu, et les réglages s'affichent en dessous",
                  "Choisissez l'axe (X, Y, Z)",
                  'Déplacez le curseur, ou tapez la position en mm puis Entrée',
                  "« Centrer » replace le plan au milieu de la pièce ; « Inverser le côté » garde l'autre moitié",
                  'La section est remplie (rendu solide, pas de vide)',
                  'Pour retirer la coupe : « Retirer la coupe » au bout des réglages, ou un nouveau clic sur « Plan de coupe »',
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
              <Body>Précision basée sur le maillage du fichier STEP, dont la finesse dépend de la qualité choisie à l'ouverture (voir section 1).</Body>
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
                  'Chaîne de cotes entre faces sur chaque axe (parois, ouvertures, niveaux), lignes de rappel partant des faces',
                  'Une cote vue de bout (ex. "l" en vue de face) est masquée tant que la vue ne tourne pas',
                  'Sur une pièce tournée, seules les vraies faces planes sont cotées (les facettes des cylindres ne créent plus de fausses cotes)',
                  'Diamètres principaux (regroupés : "4× Ø 5.50 mm"), valeur exacte lue sur le bord réel du cercle',
                  'Étiquettes de diamètre réparties autour de l\'axe, reliées au bord de leur cercle ; un perçage répété n\'a qu\'une étiquette',
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
              <SubTitle>Cotes manuelles</SubTitle>
              <List
                items={[
                  'Bouton "Cotes manuelles" : la vue passe en "Lignes cachées supprimées"',
                  "Mode \"Longueur\" : cliquez sur une arête → sa cote s'affiche (longueur de l'arête entière)",
                  'Mode "Écart entre 2 arêtes" : cliquez sur une arête puis sur une autre → leur écart (arêtes parallèles : distance perpendiculaire, placée entre leurs extrémités les plus proches)',
                  'Deux cercles de même axe (ex. haut et bas d\'un bossage) : la cote est tirée à l\'extérieur de la pièce avec des lignes de rappel, du côté où vous cliquez le premier cercle',
                  'Cliquez sur un bord de trou ou un cylindre → son diamètre exact, quelle que soit sa taille',
                  'Seules les arêtes visibles sont sélectionnables ; une face plate seule n\'affiche rien',
                  'Les cotes rejoignent le panneau Mesures (X pour en supprimer une) et sont enregistrées dans le projet .pindi',
                  "Escape ou re-clic sur le bouton : sortie et retour à l'affichage précédent",
                ]}
              />
            </section>

            <section id="animation" className="mt-8">
              <SectionTitle>10. Animation et déplacement</SectionTitle>
              <Body>Panneau ANIMATION (visible quand une pièce est sélectionnée) :</Body>
              <SubTitle>Rotation continue</SubTitle>
              <List items={['Axes X, Y, Z (combinables)', 'Vitesse : 0.1 à 5 tours/s, sens horaire/anti-horaire']} />
              <SubTitle>Rotation par angle</SubTitle>
              <List items={['Angle en degrés + axe + durée (0.5s à 10s)', 'Case « Arrêter à la collision » (voir section 11)']} />
              <SubTitle>Translation</SubTitle>
              <List
                items={[
                  'Axe + distance en mm + durée',
                  'Mode aller simple ou yoyo (boucle)',
                  'Case « Arrêter à la collision » (voir section 11)',
                ]}
              />
              <SubTitle>Animer un groupe de pièces</SubTitle>
              <List
                items={[
                  'Créez le groupe avec « Grouper » (voir section 4), puis cliquez sur son dossier : toutes les commandes du panneau ANIMATION agissent sur l’ensemble, qui bouge comme un seul bloc rigide',
                  'Une sélection multiple non groupée s’anime aussi comme un bloc, mais il faut la refaire à chaque fois : le groupe la garde',
                  'Vous pouvez créer plusieurs groupes et animer chacun avec sa propre vitesse et ses propres axes',
                ]}
              />
              <SubTitle>Centre de rotation</SubTitle>
              <Body>
                Une pièce ou un groupe tourne autour de son centre de gravité (moyenne de ses surfaces), pas du centre de sa
                boîte englobante. Pour un ensemble symétrique (un rotor à 3 pales autour de son mât, par exemple), cet
                axe passe exactement par le mât : il tourne sur place au lieu de décrire un petit cercle.
              </Body>
              <SubTitle>Mode Présentation</SubTitle>
              <Body>Rotation lente axe Y (turntable).</Body>
              <Body>La vue éclatée a sa propre section (11).</Body>
              <Body>Contrôles : Play/Pause, Stop &amp; Reset.</Body>
            </section>

            <section id="explode-collision" className="mt-8">
              <SectionTitle>11. Vue éclatée et collision</SectionTitle>
              <SubTitle>Vue éclatée</SubTitle>
              <Body>
                Bouton <strong className="text-[var(--text-primary)]">Éclater</strong> (groupe Assemblage). Les réglages
                apparaissent sur la ligne 3 de la barre d'outils.
              </Body>
              <DataTable
                headers={['Type', 'Effet']}
                rows={[
                  ['Radial', 'Chaque pièce s\'éloigne du centre de l\'assemblage, proportionnellement à sa distance (défaut)'],
                  ['Axial X / Y / Z', 'Les pièces ne bougent que le long d\'un axe : idéal pour des pièces empilées, un arbre, un cylindre'],
                  [
                    'Sous-ensembles',
                    'Les grands blocs s\'écartent d\'abord ; le curseur « Détail » écarte ensuite les pièces à l\'intérieur de chaque bloc',
                  ],
                ]}
              />
              <List
                items={[
                  <>
                    <strong className="text-[var(--text-primary)]">Curseur 0-100 %</strong> — de l'assemblé à l'éclaté
                  </>,
                  <>
                    <strong className="text-[var(--text-primary)]">Pas à pas</strong> — les pièces partent une par une, de
                    l'extérieur vers le centre : le curseur sert de ligne de temps de démontage
                  </>,
                  <>
                    <strong className="text-[var(--text-primary)]">Guides</strong> — lignes pointillées entre la position
                    d'origine et la position éclatée
                  </>,
                ]}
              />
              <Tip>
                Le mode « Sous-ensembles » dépend de la structure du fichier STEP : si l'arbre est à plat, chaque pièce forme
                son propre bloc et il se comporte comme le mode Radial.
              </Tip>

              <SubTitle>Déplacer une pièce avec collision</SubTitle>
              <List
                items={[
                  'Remettez l\'éclatement à 0 (la poignée ne s\'affiche pas tant qu\'il est actif)',
                  'Cliquez sur « Collision » (groupe Assemblage) puis sélectionnez la pièce à déplacer',
                  'Choisissez Déplacer ou Tourner, puis glissez la poignée qui apparaît sur la pièce',
                  'Au premier contact avec une autre pièce, le mouvement s\'arrête net : les deux pièces passent en rouge et la barre indique « Contact : A ↔ B »',
                  'Son : bip au moment du blocage (activable/désactivable)',
                  'Interférences : repère en rouge les pièces qui se traversent dans l\'état actuel et les liste',
                ]}
              />
              <SubTitle>Animation qui s'arrête à la collision</SubTitle>
              <List
                items={[
                  'Dans le panneau ANIMATION, cochez « Arrêter à la collision » avant de cliquer sur Tourner ou Déplacer',
                  'La pièce s\'arrête au premier contact et le message « Collision : A ↔ B - mouvement arrêté » s\'affiche',
                  'En mode Yoyo, l\'animation s\'arrête définitivement au premier contact',
                ]}
              />
              <Tip>
                Les contacts déjà présents quand le mouvement commence sont ignorés (les pièces assemblées se touchent : seul un
                contact nouveau bloque). Les autres pièces sont considérées comme fixes pendant l'animation. La détection
                compare les maillages triangle par triangle : elle peut prendre un instant sur une pièce très détaillée.
              </Tip>
            </section>

            <section id="annotations" className="mt-8">
              <SectionTitle>12. Annotations</SectionTitle>
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
              <SectionTitle>13. Sauvegarde et export</SectionTitle>
              <SubTitle>Enregistrer (.pindi)</SubTitle>
              <List
                items={[
                  'Sauvegarde caméra, couleurs, visibilité, transparence, mesures, annotations, coupe, ainsi que les groupes créés avec « Grouper », les noms donnés aux pièces et aux groupes, et le mode « Couleurs par pièce » (avec la série de « Couleur aléatoire » affichée) : tout réapparaît à l’ouverture du .pindi. Sont aussi enregistrés la sélection des pièces et le module Impression 3D (panneau ouvert, échelle, découpe, plateau, emboîtement, aperçu éclaté) : le projet s’ouvre exactement dans l’état du dernier enregistrement',
                  "Le fichier source (STEP, STL ou OBJ) est inclus dans le .pindi, compressé : le projet est autonome et s'ouvre seul, sans redemander le fichier d'origine (un .pindi fait environ le quart de la taille du STEP)",
                  'Pour restaurer : Fichier → Charger un projet (.pindi), ou glissez le .pindi dans la fenêtre',
                  "Un ancien .pindi enregistré sans fichier source s'ouvre directement si ce modèle a déjà été ouvert sur cet ordinateur (cache) ; sinon le fichier source est demandé. Réenregistrez-le pour l'inclure",
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
              <SubTitle>Impression 3D (échelle + tronçons)</SubTitle>
              <List
                items={[
                  "Bouton « Impression 3D » (groupe Impression de la barre d'outils) : réduit la pièce à l'échelle puis la découpe en tronçons qui tiennent sur le plateau de l'imprimante",
                  "1. Échelle : en % (ou 100 / 50 / 25 / 10 %) ou en hauteur cible en mm. Le modèle affiché ne change pas : l'échelle et la coupe ne s'appliquent qu'à l'export",
                  "2. Découpe : axe de coupe (auto = la dimension la plus longue), « Par nombre de tronçons » ou « Par hauteur max. », bouton « Tenir dans la hauteur du plateau ». Les plans de coupe s'affichent en bleu dans la vue 3D",
                  "3. Plateau : X / Y / Z en mm (256 × 256 × 256 par défaut). L'aperçu indique pour chaque tronçon ses dimensions L × l × H et « ✓ tient » ou « ✗ trop grand »",
                  "Exporter : un zip de STL binaires (un par tronçon, Z vers le haut, base à Z = 0) + un LISEZ-MOI. Chaque tronçon a des faces de coupe fermées : il est étanche et s'imprime tel quel",
                  "Pièces prises en compte : la sélection si elle existe, sinon toutes les pièces visibles, dans leur position actuelle (désactivez la vue éclatée avant d'exporter)",
                  "5. Emboîtement (pièces longues comme une pale) : sélectionnez la ou les pièces dans l'arborescence, puis cochez « Alvéoles carrées + broches d'assemblage ». Chaque plan de coupe reçoit des alvéoles carrées (broche + jeu, 0,25 mm par côté par défaut) creusées dans les deux tronçons, sur 12 mm de profondeur ; la broche sort dans un STL à part (broche_emboitement.stl, un seul modèle à imprimer en plusieurs exemplaires) à imprimer À PLAT. Le carré bloque la torsion. Les alvéoles restent dans la matière sur toute leur profondeur, même si la pale vrille ; sinon la profondeur est réduite, et le LISEZ-MOI signale les plans sans emboîtement complet",
                  "Aperçu éclaté des tronçons (bouton sous l'aperçu) : remplace le modèle par les vrais tronçons découpés, chacun d'une couleur, écartés le long de l'axe (curseur « Écart »), avec les alvéoles et les broches jaunes entre eux. Le modèle d'origine est masqué pendant l'aperçu et revient en le quittant ou en fermant le panneau. Cliquez sur un tronçon (dans la vue 3D ou dans la liste) pour afficher sa fiche : nom du STL, taille, volume et nombre de triangles",
                  "Broche : dans la section « 4. Emboîtement », les boutons STL et STEP exportent UNE seule broche (elles sont toutes identiques), à garder pour l'imprimer plus tard en autant d'exemplaires que nécessaire ; la quantité est indiquée à l'export et dans le LISEZ-MOI. Le STL est un maillage prêt pour le trancheur ; le STEP est un vrai solide CAO (faces planes) modifiable dans SolidWorks ou FreeCAD. Elle est aussi dans le zip d'export (broche_emboitement.stl)",
                  "Conseils d'impression (aussi dans le LISEZ-MOI) : tronçons imprimés debout sur leur face de coupe, bordure de 8 à 10 mm, 3 à 4 périmètres, ponçage grain 120/180 des faces d'assemblage, colle époxy bi-composant",
                  "Limite : pas de tube central traversant (contrairement à Pindi Blade Profiler, dont les tronçons sont paramétriques) ; un maillage source non étanche peut donner une face de coupe incomplète, signalée à l'export",
                ]}
              />
            </section>

            <section id="flow" className="mt-8">
              <SectionTitle>14. Flux de fluide</SectionTitle>
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
              <SectionTitle>15. Assistant IA</SectionTitle>
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
              <SectionTitle>16. Commandes IA</SectionTitle>
              <Body>Décrivez une action en français courant - pas besoin de syntaxe spéciale.</Body>
              <SubTitle>Exemples par catégorie</SubTitle>
              <DataTable
                headers={['Catégorie', 'Exemples']}
                rows={[
                  ['Sélection', '« Sélectionne les vis M5 », « Sélectionne tout », « Désélectionne tout »'],
                  ['Vue éclatée', '« Éclate toutes les pièces à 50% », « Remonte l\'assemblage »'],
                  [
                    'Collision',
                    '« Déplace le tube vers la droite jusqu\'à la collision », « Avance l\'arbre jusqu\'au contact », « Tourne le tube de 90° jusqu\'à la collision »',
                  ],
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
              <Body>
                Les mots « collision », « contact », « butée » ou « jusqu'à ce qu'elle heurte » dans une commande de
                déplacement ou de rotation arrêtent la pièce au premier contact. Sans distance donnée, la pièce avance
                jusqu'à rencontrer une autre pièce.
              </Body>
              <Tip>
                Si l'IA ne trouve pas une pièce, elle suggère les noms disponibles dans le modèle chargé. Précisez le nom
                exact si le résultat n'est pas celui attendu. Le zoom caméra, le plan de coupe et les mesures ne sont pas
                encore pilotables par commande IA - utilisez les outils dédiés de la toolbar pour ces actions.
              </Tip>
            </section>

            <section id="themes" className="mt-8">
              <SectionTitle>17. Thèmes</SectionTitle>
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
              <SectionTitle>18. Raccourcis clavier</SectionTitle>
              <DataTable
                headers={['Touche', 'Action']}
                rows={[
                  ['1-6', "Modes d'affichage"],
                  ['Escape', 'Désélectionner / Quitter mode / Quitter le plein écran'],
                  ['F', 'Vue Face'],
                  ['T', 'Vue Dessus'],
                  ['I', 'Vue Isométrique'],
                  ['R', 'Réinitialiser la vue'],
                  ['G', 'Toggle grille'],
                  ['M', 'Mode mesure'],
                  ['Ctrl+S', 'Enregistrer projet'],
                  ['Ctrl+P', 'Exporter PDF'],
                  ['? ou F1', "Ouvrir l'aide"],
                  ['F11', "Plein écran de la vue 3D seule (application desktop) ; Échap pour quitter"],
                ]}
              />
            </section>

            <section id="faq" className="mt-8">
              <SectionTitle>19. Dépannage et FAQ</SectionTitle>
              <Faq
                q="Mon fichier STEP ne se charge pas"
                a="Vérifiez l'extension .step/.stp. Les fichiers >50 Mo prennent du temps. Un indicateur de chargement avec le temps écoulé s'affiche."
              />
              <Faq
                q="Mon fichier STEP met beaucoup de temps à s'ouvrir"
                a="Sur l'écran d'accueil, choisissez la qualité « Standard (rapide) » : la qualité « Très précis » peut demander plusieurs minutes sur un gros assemblage. Même en Standard, la première ouverture d'un assemblage de plusieurs dizaines de pièces prend quelques dizaines de secondes ; les ouvertures suivantes du même fichier sont quasi instantanées grâce au cache."
              />
              <Faq
                q="J'ai déplacé ou modifié des pièces par erreur, comment revenir en arrière ?"
                a="Cliquez sur « État d'origine » (barre d'outils, ligne 1) : toutes les modifications sont annulées et le modèle revient tel qu'à l'ouverture. Pour ne réinitialiser que les animations d'une pièce, utilisez « Réinitialiser cette pièce » dans le panneau ANIMATION."
              />
              <Faq
                q="Comment quitter le plein écran ?"
                a="Appuyez sur Échap, ou recliquez sur « Quitter le plein écran »."
              />
              <Faq
                q="La poignée de déplacement de l'outil Collision n'apparaît pas"
                a="Vérifiez qu'une pièce est sélectionnée et que la vue éclatée est remise à 0. Le message sur la ligne 3 de la barre d'outils indique ce qui manque."
              />
              <Faq
                q="Je ne peux pas tourner la pièce"
                a="Vous êtes peut-être en mode Mesure, Pipette ou Annotation. Appuyez sur Escape pour revenir au mode normal."
              />
              <Faq
                q="Le plan de coupe montre un vide"
                a="Rechargez la page. Essayez de changer d'axe puis revenez. Les réglages s'affichent avec le bouton « Plan de coupe » de la barre d'outils."
              />
              <Faq
                q="Les mesures ne sont pas précises"
                a="Utilisez le Smart Snapping (arêtes surlignées) plutôt que de cliquer sur les surfaces. Les cotes sont calculées sur le maillage : pour plus de fidélité, rouvrez le fichier avec la qualité « Fin » ou « Très précis"
              />
              <Faq
                q="L'application est lente"
                a="Masquez les pièces non nécessaires. Désactivez le post-processing. Les assemblages >100 000 triangles peuvent ralentir."
              />
              <Faq
                q="Comment partager avec un collègue ?"
                a="Exportez un PDF. Pour une session interactive, envoyez simplement le .pindi : il contient le fichier source et s'ouvre seul."
              />
              <Faq
                q="Fonctionne sur téléphone ?"
                a="Oui, responsive avec gestes tactiles. Chrome/Safari mode paysage recommandé."
              />
              <Faq
                q="Comment changer entre mode jour et mode nuit ?"
                a="Cliquez l'icône soleil/lune dans la barre de statut (bas droite) pour basculer instantanément. Votre choix est mémorisé pour vos prochaines visites - au tout premier chargement, l'application respecte le réglage clair/sombre de votre système. L'export PDF utilise toujours le mode jour pour les captures, quel que soit le mode actif, puis revient automatiquement à votre mode."
              />
            </section>

            <section id="install" className="mt-8">
              <SectionTitle>20. Installation PWA et Desktop</SectionTitle>
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
              <p>Contact : fermeecopindi@gmail.com — Septembre 2026</p>
            </footer>
          </div>
        </div>
      </div>
    </div>
  )
}
