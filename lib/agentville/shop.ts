import type { AgentvilleWorld, InventoryItem } from './schema.js';
import { getCatalogItem } from './catalog.js';
import type { CatalogItem } from './catalog.js';

export interface ShopResult {
  success: boolean;
  error?: string;
  item?: InventoryItem;
}

/** Purchase an item from the catalog, deducting coins and adding it to inventory. */
export function purchaseItem(world: AgentvilleWorld, catalogId: string): ShopResult {
  const catalog: CatalogItem | undefined = getCatalogItem(catalogId);
  if (!catalog) return { success: false, error: 'Item not found in catalog' };
  if (world.coins < catalog.price) return { success: false, error: 'Insufficient coins' };

  // Deduct coins
  world.coins -= catalog.price;
  world.stats.totalCoinsSpent += catalog.price;

  // Create inventory item with unique ID
  const item: InventoryItem = {
    id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    catalogId,
    type: catalog.type,
    placed: false,
    placedAt: null,
  };
  world.inventory.push(item);

  // For expansions: create new room/floor
  if (catalog.type === 'expansion') {
    handleExpansion(world, catalogId);
  }

  return { success: true, item };
}

/** Handle expansion purchases — resize the world grid. */
function handleExpansion(world: AgentvilleWorld, catalogId: string): void {
  const floor = world.world.floors[0];
  if (!floor || !floor.rooms[0]) return;
  const room = floor.rooms[0];

  if (catalogId === 'expand_room') {
    // Expand the world grid — add 5 columns
    room.width += 5;
  } else if (catalogId === 'expand_floor') {
    // Expand the world grid — add 5 rows
    room.height += 5;
  }
  // expand_room_upgrade is handled via placement/UI (Phase 6)
}

/** Place an inventory item in a specific room at the given coordinates. */
export function placeItem(
  world: AgentvilleWorld,
  itemId: string,
  roomId: string,
  x: number,
  y: number,
): ShopResult {
  const item = world.inventory.find(i => i.id === itemId);
  if (!item) return { success: false, error: 'Item not in inventory' };

  // Find the room
  let room = null;
  for (const floor of world.world.floors) {
    room = floor.rooms.find(r => r.id === roomId);
    if (room) break;
  }
  if (!room) return { success: false, error: 'Room not found' };

  // Check bounds
  if (x < 0 || y < 0 || x >= room.width || y >= room.height) {
    return { success: false, error: 'Position out of bounds' };
  }

  // Check if position is occupied by another placed item
  const occupied = world.inventory.some(
    i => i.placed && i.placedAt?.roomId === roomId && i.placedAt.x === x && i.placedAt.y === y && i.id !== itemId,
  );
  if (occupied) return { success: false, error: 'Position already occupied' };

  item.placed = true;
  item.placedAt = { roomId, x, y };
  return { success: true, item };
}

/** Remove an item from its placed position, returning it to unplaced inventory. */
export function unplaceItem(world: AgentvilleWorld, itemId: string): ShopResult {
  const item = world.inventory.find(i => i.id === itemId);
  if (!item) return { success: false, error: 'Item not in inventory' };
  if (!item.placed) return { success: false, error: 'Item is not placed' };

  // If this is a desk, unassign any agent sitting at it
  if (item.type === 'desk') {
    for (const agent of Object.values(world.agents)) {
      if (agent.desk === item.id) {
        agent.desk = null;
      }
    }
  }

  item.placed = false;
  item.placedAt = null;
  return { success: true, item };
}

/** Set an agent's cosmetic sprite to a purchased cosmetic. */
export function setAgentCosmetic(
  world: AgentvilleWorld,
  agentKey: string,
  cosmeticCatalogId: string,
): ShopResult {
  const agent = world.agents[agentKey];
  if (!agent) return { success: false, error: 'Agent not found' };

  // Verify cosmetic is owned
  const owned = world.inventory.some(i => i.catalogId === cosmeticCatalogId && i.type === 'cosmetic');
  if (!owned) return { success: false, error: 'Cosmetic not owned' };

  agent.cosmetic = cosmeticCatalogId;
  return { success: true };
}
