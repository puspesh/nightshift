export interface CatalogItem {
  catalogId: string;
  name: string;
  type: 'desk' | 'facility' | 'decoration' | 'cosmetic' | 'consumable' | 'expansion';
  price: number;
  rarity: 'common' | 'rare' | 'legendary';
  category?: string;
  multiplierBonus?: number;
  description: string;
}

const CATALOG: CatalogItem[] = [
  // Desks
  { catalogId: 'desk_basic', name: 'Basic Desk', type: 'desk', price: 200, rarity: 'common', description: 'A simple desk to get started.' },
  { catalogId: 'desk_dual_monitor', name: 'Dual Monitor Desk', type: 'desk', price: 800, rarity: 'common', description: 'Two screens, twice the productivity.' },
  { catalogId: 'desk_standing', name: 'Standing Desk', type: 'desk', price: 1200, rarity: 'rare', description: 'Ergonomic standing desk for the health-conscious.' },
  { catalogId: 'desk_corner_office', name: 'Corner Office Desk', type: 'desk', price: 2000, rarity: 'rare', description: 'The corner office — a status symbol.' },

  // Facilities — hydration
  { catalogId: 'facility_water_cooler', name: 'Water Cooler', type: 'facility', price: 500, rarity: 'common', category: 'hydration', description: 'Stay hydrated, stay productive.' },
  { catalogId: 'facility_coffee_machine', name: 'Coffee Machine', type: 'facility', price: 1000, rarity: 'common', category: 'hydration', description: 'Premium espresso on demand.' },

  // Facilities — food
  { catalogId: 'facility_vending_machine', name: 'Vending Machine', type: 'facility', price: 500, rarity: 'common', category: 'food', description: 'Snacks for late-night coding.' },
  { catalogId: 'facility_kitchen', name: 'Kitchen', type: 'facility', price: 2000, rarity: 'rare', category: 'food', description: 'A full kitchen for gourmet fuel.' },

  // Facilities — rest
  { catalogId: 'facility_couch', name: 'Couch', type: 'facility', price: 500, rarity: 'common', category: 'rest', description: 'A comfy couch for quick breaks.' },
  { catalogId: 'facility_nap_pod', name: 'Nap Pod', type: 'facility', price: 2000, rarity: 'rare', category: 'rest', description: 'Power naps, Silicon Valley style.' },

  // Facilities — comfort
  { catalogId: 'facility_ergo_desk', name: 'Ergonomic Desk Setup', type: 'facility', price: 1000, rarity: 'common', category: 'comfort', description: 'Wrist rests, monitor arms, the works.' },
  { catalogId: 'facility_good_lighting', name: 'Good Lighting', type: 'facility', price: 800, rarity: 'common', category: 'comfort', description: 'Warm, adjustable lighting throughout.' },

  // Facilities — fun
  { catalogId: 'facility_ping_pong', name: 'Ping Pong Table', type: 'facility', price: 1000, rarity: 'common', category: 'fun', description: 'Settle code disputes the old-fashioned way.' },
  { catalogId: 'facility_game_room', name: 'Game Room', type: 'facility', price: 3000, rarity: 'rare', category: 'fun', description: 'Arcade cabinets and bean bags.' },

  // Decorations — common (+1%)
  { catalogId: 'deco_plant', name: 'Potted Plant', type: 'decoration', price: 100, rarity: 'common', multiplierBonus: 0.01, description: 'A touch of green for the office.' },
  { catalogId: 'deco_poster', name: 'Motivational Poster', type: 'decoration', price: 150, rarity: 'common', multiplierBonus: 0.01, description: '"Ship it" in a nice frame.' },
  { catalogId: 'deco_lamp', name: 'Desk Lamp', type: 'decoration', price: 200, rarity: 'common', multiplierBonus: 0.01, description: 'Warm light for late nights.' },
  { catalogId: 'deco_rug', name: 'Area Rug', type: 'decoration', price: 300, rarity: 'common', multiplierBonus: 0.01, description: 'It really ties the room together.' },

  // Decorations — rare (+3%)
  { catalogId: 'deco_aquarium', name: 'Aquarium', type: 'decoration', price: 2000, rarity: 'rare', multiplierBonus: 0.03, description: 'Tropical fish to watch during builds.' },
  { catalogId: 'deco_arcade', name: 'Arcade Cabinet', type: 'decoration', price: 3000, rarity: 'rare', multiplierBonus: 0.03, description: 'Classic games for break time.' },
  { catalogId: 'deco_trophy_case', name: 'Trophy Case', type: 'decoration', price: 5000, rarity: 'rare', multiplierBonus: 0.03, description: 'Display your team achievements.' },

  // Decorations — legendary (+5%)
  { catalogId: 'deco_rooftop_garden', name: 'Rooftop Garden', type: 'decoration', price: 15000, rarity: 'legendary', multiplierBonus: 0.05, description: 'A lush garden above the office.' },
  { catalogId: 'deco_fountain', name: 'Indoor Fountain', type: 'decoration', price: 10000, rarity: 'legendary', multiplierBonus: 0.05, description: 'The sound of running water soothes all.' },
  { catalogId: 'deco_hologram', name: 'Holographic Display', type: 'decoration', price: 25000, rarity: 'legendary', multiplierBonus: 0.05, description: 'Futuristic holograms projected in the lobby.' },

  // Cosmetics
  { catalogId: 'cosmetic_cat', name: 'Cat Sprite', type: 'cosmetic', price: 200, rarity: 'common', description: 'A tiny cat avatar.' },
  { catalogId: 'cosmetic_dog', name: 'Dog Sprite', type: 'cosmetic', price: 200, rarity: 'common', description: 'A loyal dog avatar.' },
  { catalogId: 'cosmetic_robot', name: 'Robot Sprite', type: 'cosmetic', price: 500, rarity: 'common', description: 'Beep boop, coding in progress.' },
  { catalogId: 'cosmetic_ninja', name: 'Ninja Sprite', type: 'cosmetic', price: 500, rarity: 'common', description: 'Silent but deadly code reviews.' },
  { catalogId: 'cosmetic_astronaut', name: 'Astronaut Sprite', type: 'cosmetic', price: 800, rarity: 'rare', description: 'One small step for agents.' },
  { catalogId: 'cosmetic_wizard', name: 'Wizard Sprite', type: 'cosmetic', price: 800, rarity: 'rare', description: 'Casting spells on the codebase.' },
  { catalogId: 'cosmetic_pirate', name: 'Pirate Sprite', type: 'cosmetic', price: 1000, rarity: 'rare', description: 'Yarr, hand over the merge conflicts.' },
  { catalogId: 'cosmetic_dragon', name: 'Dragon Sprite', type: 'cosmetic', price: 2000, rarity: 'legendary', description: 'A fearsome code-breathing dragon.' },

  // Consumables
  { catalogId: 'boost_focus', name: 'Focus Boost', type: 'consumable', price: 100, rarity: 'common', description: '30 min of 1.5x earning rate.' },
  { catalogId: 'boost_energy', name: 'Energy Boost', type: 'consumable', price: 150, rarity: 'common', description: '30 min of 2x earning rate.' },
  { catalogId: 'boost_hyperfocus', name: 'Hyperfocus Boost', type: 'consumable', price: 200, rarity: 'rare', description: '60 min of 2x earning rate.' },

  // Expansions
  { catalogId: 'expand_room', name: 'New Room', type: 'expansion', price: 5000, rarity: 'rare', description: 'Add a new room to your floor.' },
  { catalogId: 'expand_room_upgrade', name: 'Room Upgrade', type: 'expansion', price: 3000, rarity: 'common', description: 'Make an existing room larger.' },
  { catalogId: 'expand_floor', name: 'New Floor', type: 'expansion', price: 12000, rarity: 'legendary', description: 'Add an entire new floor to the building.' },
];

const catalogIndex = new Map<string, CatalogItem>();
for (const item of CATALOG) {
  catalogIndex.set(item.catalogId, item);
}

// Base earning rates (coins per work event)
const BASE_RATES: Record<string, number> = {
  issue_triaged: 10,
  plan_written: 50,
  review_completed: 30,
  test_passed: 40,
  pr_merged: 100,
};

export interface DropTableEntry {
  weight: number;
  type: 'coins' | 'item';
  coins?: { min: number; max: number };
  catalogId?: string;
}

const DROP_TABLE: DropTableEntry[] = [
  { weight: 50, type: 'coins', coins: { min: 5, max: 25 } },
  { weight: 25, type: 'coins', coins: { min: 25, max: 75 } },
  { weight: 10, type: 'coins', coins: { min: 75, max: 200 } },
  { weight: 5, type: 'item', catalogId: 'deco_plant' },
  { weight: 5, type: 'item', catalogId: 'deco_poster' },
  { weight: 3, type: 'item', catalogId: 'deco_lamp' },
  { weight: 1, type: 'item', catalogId: 'deco_aquarium' },
  { weight: 1, type: 'item', catalogId: 'boost_focus' },
];

const DROP_CHANCE = 0.10;

export function getCatalogItem(id: string): CatalogItem | undefined {
  return catalogIndex.get(id);
}

export function getCatalogByType(type: string): CatalogItem[] {
  return CATALOG.filter((item) => item.type === type);
}

export function getBaseRate(workType: string): number {
  return BASE_RATES[workType] ?? 0;
}

export function rollDrop(rng?: () => number): { type: 'coins'; amount: number } | { type: 'item'; catalogId: string } | null {
  const rand = rng ?? Math.random;

  if (rand() >= DROP_CHANCE) return null;

  const totalWeight = DROP_TABLE.reduce((sum, e) => sum + e.weight, 0);
  let roll = rand() * totalWeight;

  for (const entry of DROP_TABLE) {
    roll -= entry.weight;
    if (roll <= 0) {
      if (entry.type === 'coins' && entry.coins) {
        const amount = Math.floor(rand() * (entry.coins.max - entry.coins.min + 1)) + entry.coins.min;
        return { type: 'coins', amount };
      }
      if (entry.type === 'item' && entry.catalogId) {
        return { type: 'item', catalogId: entry.catalogId };
      }
      return null;
    }
  }

  return null;
}

export const DEFAULT_COSMETICS = [
  'cosmetic_cat',
  'cosmetic_dog',
  'cosmetic_robot',
  'cosmetic_ninja',
];
