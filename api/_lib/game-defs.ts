export const LEGACY_BUILDING_MAP: Record<string, string> = {
  mine: 'solana_collector',
  elixir_collector: 'solana_collector',
};

export const BUILDING_TYPES = [
  'town_hall',
  'barracks',
  'cannon',
  'ballista',
  'xbow',
  'solana_collector',
  'mortar',
  'tesla',
  'wall',
  'army_camp',
  'prism',
  'magmavent',
  'dragons_breath',
  'spike_launcher',
] as const;

export const OBSTACLE_TYPES = [
  'rock_small',
  'rock_large',
  'tree_oak',
  'tree_pine',
  'grass_patch',
] as const;

export const TROOP_TYPES = [
  'warrior',
  'archer',
  'giant',
  'ward',
  'recursion',
  'ram',
  'stormmage',
  'golem',
  'sharpshooter',
  'mobilemortar',
  'davincitank',
  'phalanx',
  'romanwarrior',
] as const;

const BUILDING_SET = new Set<string>(BUILDING_TYPES);
const OBSTACLE_SET = new Set<string>(OBSTACLE_TYPES);
const TROOP_SET = new Set<string>(TROOP_TYPES);

export function normalizeBuildingType(raw: string | null): string | null {
  if (!raw) return null;
  const mapped = LEGACY_BUILDING_MAP[raw] || raw;
  return BUILDING_SET.has(mapped) ? mapped : null;
}

export function isValidObstacleType(raw: string | null): raw is string {
  if (!raw) return false;
  return OBSTACLE_SET.has(raw);
}

export function isValidTroopType(raw: string | null): raw is string {
  if (!raw) return false;
  return TROOP_SET.has(raw);
}
