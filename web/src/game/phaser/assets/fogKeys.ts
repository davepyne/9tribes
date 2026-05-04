export type FogRenderState = 'u' | 'f' | 'k';

const VISIBILITY_TO_FOG_STATE: Record<'hidden' | 'explored' | 'visible', FogRenderState> = {
  hidden: 'u',
  explored: 'f',
  visible: 'k',
};

export function getFogRenderState(visibility: 'hidden' | 'explored' | 'visible'): FogRenderState {
  return VISIBILITY_TO_FOG_STATE[visibility];
}

export function getFogTag(north: FogRenderState, east: FogRenderState, south: FogRenderState, west: FogRenderState): string {
  return `t.fog_${north}_${east}_${south}_${west}`;
}
