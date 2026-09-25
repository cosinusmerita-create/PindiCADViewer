import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { usePrintStore } from '../hooks/usePrintStore'

const PIECE_COLORS = ['#38bdf8', '#34d399', '#a78bfa', '#fb7185', '#fbbf24', '#2dd4bf', '#f472b6', '#84cc16']

function toGeometry(positions: Float32Array) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  g.computeVertexNormals()
  return g
}

// Aperçu éclaté du module Impression 3D : chaque tronçon d'une couleur, les
// broches d'assemblage en jaune. Un clic sur un tronçon le sélectionne (sa fiche
// s'affiche dans PrintPieceInfo) ; un clic dans le vide le désélectionne. Le
// gestionnaire de clic du modèle ne voit pas ces maillages (il est posé sur le
// modèle lui-même), donc la sélection de pièces du viewer n'est pas touchée.
export function PrintPiecesPreview() {
  const preview = usePrintStore((s) => s.preview)
  const selected = usePrintStore((s) => s.previewSelected)
  const geometries = useMemo(
    () => (preview ? { pieces: preview.pieces.map(toGeometry), pins: preview.pins ? toGeometry(preview.pins) : null } : null),
    [preview],
  )
  useEffect(
    () => () => {
      geometries?.pieces.forEach((g) => g.dispose())
      geometries?.pins?.dispose()
    },
    [geometries],
  )
  if (!geometries) return null
  const select = (i: number | null) => usePrintStore.getState().set({ previewSelected: i })
  return (
    <group>
      {geometries.pieces.map((g, i) => (
        <mesh
          key={i}
          geometry={g}
          onClick={(e) => {
            e.stopPropagation()
            select(selected === i ? null : i)
          }}
          onPointerOver={(e) => {
            e.stopPropagation()
            document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => (document.body.style.cursor = '')}
        >
          <meshStandardMaterial
            color={PIECE_COLORS[i % PIECE_COLORS.length]}
            emissive={selected === i ? '#f59e0b' : '#000000'}
            emissiveIntensity={selected === i ? 0.55 : 0}
            metalness={0.1}
            roughness={0.6}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      {geometries.pins && (
        <mesh geometry={geometries.pins} raycast={() => null}>
          <meshStandardMaterial color="#facc15" emissive="#a16207" metalness={0.1} roughness={0.5} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  )
}
