import { usePrintStore } from '../hooks/usePrintStore'

// Plans de coupe du module Impression 3D, superposés au modèle : translucides,
// sans écriture de profondeur (ils ne masquent rien) ni lancer de rayons
// (ils ne gênent pas la sélection).
export function PrintCutPlanes() {
  const planes = usePrintStore((s) => s.planes)
  if (!planes) return null
  const { axis, positions, center, size } = planes
  // PlaneGeometry est dans le plan XY : on la tourne pour qu'elle soit
  // perpendiculaire à l'axe de coupe, et on range largeur/hauteur en
  // conséquence (axe x -> plan YZ, largeur portée par z).
  const rotation: [number, number, number] = axis === 'y' ? [-Math.PI / 2, 0, 0] : axis === 'x' ? [0, Math.PI / 2, 0] : [0, 0, 0]
  const [w, h] = axis === 'x' ? [size[1], size[0]] : size
  return (
    <group renderOrder={20}>
      {positions.map((p, i) => {
        const pos: [number, number, number] = [center[0], center[1], center[2]]
        pos[axis === 'x' ? 0 : axis === 'y' ? 1 : 2] = p
        return (
          <group key={i} position={pos} rotation={rotation}>
            <mesh raycast={() => null}>
              <planeGeometry args={[w, h]} />
              <meshBasicMaterial color="#38bdf8" transparent opacity={0.18} side={2} depthWrite={false} toneMapped={false} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

