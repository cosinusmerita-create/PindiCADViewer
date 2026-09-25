// Écriture STEP (ISO 10303-21, AP214) de parallélépipèdes : de vraies faces
// planes en B-rep (pas un maillage), donc modifiables dans un logiciel de CAO
// (SolidWorks, FreeCAD, Fusion...). Utilisé pour les broches d'emboîtement.

export interface StepBox {
  // Coin minimal et dimensions (mm).
  x: number
  y: number
  z: number
  dx: number
  dy: number
  dz: number
}

type V3 = [number, number, number]

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: V3) => Math.hypot(a[0], a[1], a[2])
const unit = (a: V3): V3 => {
  const l = len(a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
const num = (v: number) => {
  const s = (Math.abs(v) < 1e-12 ? 0 : v).toFixed(6).replace(/0+$/, '').replace(/\.$/, '.0')
  return s.includes('.') ? s : s + '.0'
}
const triple = (v: V3) => `(${num(v[0])},${num(v[1])},${num(v[2])})`

// Faces d'un cube (indices de sommets, sens antihoraire vu de l'extérieur).
// Sommets : 0..3 = z bas (x0y0, x1y0, x1y1, x0y1), 4..7 = z haut (même ordre).
const FACES: number[][] = [
  [0, 3, 2, 1], // bas  (-z)
  [4, 5, 6, 7], // haut (+z)
  [0, 1, 5, 4], // -y
  [1, 2, 6, 5], // +x
  [2, 3, 7, 6], // +y
  [3, 0, 4, 7], // -x
]

export function writeBoxesStep(boxes: StepBox[], name: string): string {
  const lines: string[] = []
  let id = 0
  // Ajoute une entité et renvoie sa référence (#n).
  const add = (body: string) => {
    id++
    lines.push(`#${id}=${body};`)
    return `#${id}`
  }

  const appCtx = add("APPLICATION_CONTEXT('core data for automotive mechanical design processes')")
  add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${appCtx})`)
  const prodCtx = add(`PRODUCT_CONTEXT('',${appCtx},'mechanical')`)
  const product = add(`PRODUCT('${name}','${name}','',(${prodCtx}))`)
  const formation = add(`PRODUCT_DEFINITION_FORMATION('','',${product})`)
  const defCtx = add(`PRODUCT_DEFINITION_CONTEXT('part definition',${appCtx},'design')`)
  const definition = add(`PRODUCT_DEFINITION('design','',${formation},${defCtx})`)
  const defShape = add(`PRODUCT_DEFINITION_SHAPE('','',${definition})`)

  // Contexte géométrique : mm, radian, stéradian, incertitude 1e-5 mm.
  const lengthUnit = add("(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))")
  const angleUnit = add('(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))')
  const solidAngleUnit = add('(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())')
  const uncertainty = add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-05),${lengthUnit},'distance_accuracy_value','')`)
  const context = add(
    `(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${uncertainty}))GLOBAL_UNIT_ASSIGNED_CONTEXT((${lengthUnit},${angleUnit},${solidAngleUnit}))REPRESENTATION_CONTEXT('Context3D','3D Context'))`,
  )

  const solids: string[] = []
  boxes.forEach((b, bi) => {
    const p0: V3 = [b.x, b.y, b.z]
    const verts: V3[] = [
      [p0[0], p0[1], p0[2]],
      [p0[0] + b.dx, p0[1], p0[2]],
      [p0[0] + b.dx, p0[1] + b.dy, p0[2]],
      [p0[0], p0[1] + b.dy, p0[2]],
      [p0[0], p0[1], p0[2] + b.dz],
      [p0[0] + b.dx, p0[1], p0[2] + b.dz],
      [p0[0] + b.dx, p0[1] + b.dy, p0[2] + b.dz],
      [p0[0], p0[1] + b.dy, p0[2] + b.dz],
    ]
    const points = verts.map((v) => add(`CARTESIAN_POINT('',${triple(v)})`))
    const vertexPoints = points.map((p) => add(`VERTEX_POINT('',${p})`))

    // Une arête par paire de sommets ; sens de référence = première rencontre.
    const edges = new Map<string, { ref: string; from: number }>()
    const edgeFor = (a: number, c: number) => {
      const key = a < c ? `${a}_${c}` : `${c}_${a}`
      let e = edges.get(key)
      if (!e) {
        const d = sub(verts[c], verts[a])
        const dir = add(`DIRECTION('',${triple(unit(d))})`)
        const vec = add(`VECTOR('',${dir},${num(len(d))})`)
        const line = add(`LINE('',${points[a]},${vec})`)
        e = { ref: add(`EDGE_CURVE('',${vertexPoints[a]},${vertexPoints[c]},${line},.T.)`), from: a }
        edges.set(key, e)
      }
      return e
    }

    const faceRefs = FACES.map((loop) => {
      const oriented = loop.map((a, i) => {
        const c = loop[(i + 1) % loop.length]
        const e = edgeFor(a, c)
        return add(`ORIENTED_EDGE('',*,*,${e.ref},${e.from === a ? '.T.' : '.F.'})`)
      })
      const edgeLoop = add(`EDGE_LOOP('',(${oriented.join(',')}))`)
      const bound = add(`FACE_OUTER_BOUND('',${edgeLoop},.T.)`)
      const [a, c, d] = [verts[loop[0]], verts[loop[1]], verts[loop[2]]]
      const normal = unit(cross(sub(c, a), sub(d, c)))
      const refDir = unit(sub(c, a))
      const origin = add(`CARTESIAN_POINT('',${triple(a)})`)
      const axis = add(`DIRECTION('',${triple(normal)})`)
      const ref = add(`DIRECTION('',${triple(refDir)})`)
      const placement = add(`AXIS2_PLACEMENT_3D('',${origin},${axis},${ref})`)
      const plane = add(`PLANE('',${placement})`)
      return add(`ADVANCED_FACE('',(${bound}),${plane},.T.)`)
    })
    const shell = add(`CLOSED_SHELL('',(${faceRefs.join(',')}))`)
    solids.push(add(`MANIFOLD_SOLID_BREP('broche_${bi + 1}',${shell})`))
  })

  const originPoint = add(`CARTESIAN_POINT('',(0.,0.,0.))`)
  const zDir = add(`DIRECTION('',(0.,0.,1.))`)
  const xDir = add(`DIRECTION('',(1.,0.,0.))`)
  const worldAxis = add(`AXIS2_PLACEMENT_3D('',${originPoint},${zDir},${xDir})`)
  const rep = add(`ADVANCED_BREP_SHAPE_REPRESENTATION('',(${worldAxis},${solids.join(',')}),${context})`)
  add(`SHAPE_DEFINITION_REPRESENTATION(${defShape},${rep})`)

  const date = new Date().toISOString().slice(0, 19)
  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('Broches d\\'emboitement - PindiCADViewer'),'2;1');",
    `FILE_NAME('${name}.step','${date}',('PindiCADViewer'),(''),'PindiCADViewer','PindiCADViewer','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));",
    'ENDSEC;',
    'DATA;',
    ...lines,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n')
}
