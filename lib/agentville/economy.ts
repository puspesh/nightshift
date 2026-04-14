import type { AgentvilleWorld } from './schema.js';
import { getBaseRate, rollDrop, getCatalogItem } from './catalog.js';

export interface AwardResult {
  coinsAwarded: number;
  multiplier: number;
  drop?: { type: 'coins'; amount: number } | { type: 'item'; catalogId: string };
}

export function calculateMultiplier(world: AgentvilleWorld, agentKey: string, activeAgentCount: number): number {
  let mult = 1.0;

  // Agent count: +10% per additional active agent (not counting self)
  mult += Math.max(0, activeAgentCount - 1) * 0.10;

  // Desk bonus: +10% if agent has a desk
  const agentRecord = world.agents[agentKey];
  if (agentRecord?.desk) mult += 0.10;

  // Streak bonus: +5% per day, cap at +50%
  mult += Math.min(world.stats.streakDays * 0.05, 0.50);

  // Needs met: +10% per facility category with at least one placed facility
  const facilityCategories = new Set<string>();
  for (const item of world.inventory) {
    if (item.type === 'facility' && item.placed) {
      const cat = getCatalogItem(item.catalogId);
      if (cat?.category) facilityCategories.add(cat.category);
    }
  }
  mult += Math.min(facilityCategories.size * 0.10, 0.50);

  // Decoration bonus: sum of multiplierBonus for placed decorations, cap +20%
  let decoBonus = 0;
  for (const item of world.inventory) {
    if (item.type === 'decoration' && item.placed) {
      const cat = getCatalogItem(item.catalogId);
      if (cat) decoBonus += cat.multiplierBonus ?? 0;
    }
  }
  mult += Math.min(decoBonus, 0.20);

  return mult;
}

export function awardCoins(
  world: AgentvilleWorld,
  agentKey: string,
  workType: string,
  activeAgentCount: number,
  rng?: () => number,
): AwardResult {
  const base = getBaseRate(workType);
  if (base === 0) return { coinsAwarded: 0, multiplier: 1.0 };

  const multiplier = calculateMultiplier(world, agentKey, activeAgentCount);
  const coins = Math.round(base * multiplier);

  world.coins += coins;
  world.stats.totalCoinsEarned += coins;
  world.stats.totalWorkCompleted += 1;

  const drop = rollDrop(rng);
  if (drop?.type === 'coins') {
    world.coins += drop.amount;
    world.stats.totalCoinsEarned += drop.amount;
  }

  return { coinsAwarded: coins, multiplier, drop: drop ?? undefined };
}
