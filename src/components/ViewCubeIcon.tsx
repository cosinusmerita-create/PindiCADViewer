import type { ViewPreset } from '../types/model'

// Small cube for the VUES buttons, in cabinet projection so the three hidden
// faces (Arrière, Gauche, Dessous) still have a place of their own: the face
// the view looks at is filled, hidden edges are dashed. Isométrique shades
// the three visible faces, like a solid cube.
//
//   front square (2,5)-(11,14), back square shifted by (+4,-4); the hidden
//   corner is (6,10).
const FACES: Record<Exclude<ViewPreset, 'iso'>, string> = {
  front: '2,5 11,5 11,14 2,14',
  back: '6,1 15,1 15,10 6,10',
  top: '2,5 6,1 15,1 11,5',
  bottom: '2,14 6,10 15,10 11,14',
  right: '11,5 15,1 15,10 11,14',
  left: '2,5 6,1 6,10 2,14',
}

// Faces behind the cube: drawn under the outline so the dashes stay visible.
const HIDDEN: ViewPreset[] = ['back', 'left', 'bottom']

// `active`: on the lit (blue) button the face is drawn in the text colour.
export function ViewCubeIcon({ view, size = 16, active = false }: { view: ViewPreset; size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 17 16" fill="none" aria-hidden="true">
      {view === 'iso' ? (
        <>
          <polygon points={FACES.top} fill="currentColor" fillOpacity={0.55} />
          <polygon points={FACES.front} fill="currentColor" fillOpacity={0.3} />
          <polygon points={FACES.right} fill="currentColor" fillOpacity={0.15} />
        </>
      ) : (
        <polygon
          points={FACES[view]}
          fill="currentColor"
          fillOpacity={HIDDEN.includes(view) ? 0.35 : 0.6}
          className={active ? undefined : 'text-sky-400'}
        />
      )}
      {/* Hidden edges, meeting at the back-bottom-left corner. */}
      <path d="M6 1V10M2 14L6 10M15 10H6" stroke="currentColor" strokeWidth={0.9} strokeDasharray="1.4 1.2" opacity={0.6} />
      {/* Visible outline. */}
      <path
        d="M2 5H11V14H2Z M2 5L6 1H15L11 5 M11 14L15 10V1"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
    </svg>
  )
}
