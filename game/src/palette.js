// The look plan, in one place. Six base values from the starter plus three role
// colours: foe red for the Sentinel defenders, ally teal for Vanguard teammates,
// site green for the bomb-zone markers. The same names are the CSS custom
// properties in index.html; lighting makes every shade the game needs.
export const PALETTE = {
  canvas: '#14161a',
  surface: '#1e2228',
  hairline: '#2c323a',
  ink: '#e9e6df',
  muted: '#98a0a8',
  accent: '#f0a830',
  foe: '#e0564b',
  ally: '#4fb3a9',
  site: '#7fb069',
};

export function shade(name) {
  return PALETTE[name];
}
