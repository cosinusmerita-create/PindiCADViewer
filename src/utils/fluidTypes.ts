export type FlowFluidType = 'water' | 'air' | 'oil'

export interface FluidTypeConfig {
  label: string
  color: string
  shape: 'sphere' | 'arrow'
}

// Shared between Toolbar.tsx (the fluid picker) and Viewer3D.tsx (the
// actual marker rendering) so both always agree on what "water" looks
// like without duplicating the color/shape mapping in two places.
export const FLUID_TYPES: Record<FlowFluidType, FluidTypeConfig> = {
  water: { label: 'Eau', color: '#38bdf8', shape: 'sphere' },
  air: { label: 'Air', color: '#e5e7eb', shape: 'arrow' },
  oil: { label: 'Huile', color: '#f59e0b', shape: 'sphere' },
}
