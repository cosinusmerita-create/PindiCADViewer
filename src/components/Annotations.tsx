import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'
import { X } from 'lucide-react'
import { useModelStore } from '../hooks/useModelState'

const FLAG_COLOR = '#4488ff'

// A small flag marker offset above the actual annotated point, joined to it
// by a thin leader line - the point itself gets a dot so the exact
// annotated spot stays visible under the flag's offset.
export function Annotations({ markerRadius }: { markerRadius: number }) {
  const annotations = useModelStore((s) => s.annotations)
  const removeAnnotation = useModelStore((s) => s.removeAnnotation)

  if (annotations.length === 0) return null

  const flagOffset = markerRadius * 6

  return (
    <group>
      {annotations.map((annotation) => {
        const flagPos = annotation.position.clone().add(new THREE.Vector3(0, flagOffset, 0))
        return (
          <group key={annotation.id}>
            <mesh position={annotation.position}>
              <sphereGeometry args={[markerRadius * 0.7, 12, 12]} />
              <meshBasicMaterial color={FLAG_COLOR} />
            </mesh>
            <Line points={[annotation.position, flagPos]} color={FLAG_COLOR} lineWidth={1.5} />
            <Html position={flagPos} pointerEvents="auto" style={{ transform: 'translate(-8px, -100%)' }}>
              <div
                className="max-w-[220px] rounded-md border px-2 py-1.5 text-xs text-white shadow-lg"
                style={{ backgroundColor: '#2a2a3e', borderColor: '#4488ff' }}
              >
                <div className="flex items-start gap-1.5">
                  <span className="flex-1 whitespace-pre-wrap break-words">{annotation.text}</span>
                  <button
                    title="Supprimer l'annotation"
                    onClick={() => removeAnnotation(annotation.id)}
                    className="shrink-0 text-slate-400 hover:text-red-400"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            </Html>
          </group>
        )
      })}
    </group>
  )
}
