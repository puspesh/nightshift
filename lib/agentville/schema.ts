export interface AgentvilleWorld {
  schemaVersion: 1;
  coins: number;
  inventory: InventoryItem[];
  world: WorldLayout;
  agents: Record<string, AgentRecord>;
  stats: WorldStats;
  cloudSync: CloudSync;
}

export interface InventoryItem {
  id: string;
  catalogId: string;
  type: ItemType;
  placed: boolean;
  placedAt: PlacedAt | null;
}

export type ItemType = 'desk' | 'facility' | 'decoration' | 'cosmetic' | 'consumable' | 'expansion';

export interface PlacedAt {
  roomId: string;
  x: number;
  y: number;
}

export interface WorldLayout {
  floors: Floor[];
}

export interface Floor {
  id: string;
  name: string;
  rooms: Room[];
}

export interface Room {
  id: string;
  name: string;
  width: number;
  height: number;
  style: string;
}

export interface AgentRecord {
  source: string;
  name: string;
  cosmetic: string;
  accessories: string[];
  desk: string | null;
}

export interface WorldStats {
  totalCoinsEarned: number;
  totalCoinsSpent: number;
  totalWorkCompleted: number;
  streakDays: number;
  lastActiveDate: string;
  timezone: string;
}

export interface CloudSync {
  lastSyncedAt: string | null;
  syncSequence: number;
}

const VALID_ITEM_TYPES = new Set<string>(['desk', 'facility', 'decoration', 'cosmetic', 'consumable', 'expansion']);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isPlacedAt(v: unknown): v is PlacedAt {
  if (!isObject(v)) return false;
  return typeof v.roomId === 'string' && typeof v.x === 'number' && typeof v.y === 'number';
}

function isInventoryItem(v: unknown): v is InventoryItem {
  if (!isObject(v)) return false;
  return (
    typeof v.id === 'string' &&
    typeof v.catalogId === 'string' &&
    typeof v.type === 'string' &&
    VALID_ITEM_TYPES.has(v.type as string) &&
    typeof v.placed === 'boolean' &&
    (v.placedAt === null || isPlacedAt(v.placedAt))
  );
}

function isRoom(v: unknown): v is Room {
  if (!isObject(v)) return false;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.width === 'number' &&
    typeof v.height === 'number' &&
    typeof v.style === 'string'
  );
}

function isFloor(v: unknown): v is Floor {
  if (!isObject(v)) return false;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    Array.isArray(v.rooms) &&
    v.rooms.every(isRoom)
  );
}

function isWorldLayout(v: unknown): v is WorldLayout {
  if (!isObject(v)) return false;
  return Array.isArray(v.floors) && v.floors.every(isFloor);
}

function isAgentRecord(v: unknown): v is AgentRecord {
  if (!isObject(v)) return false;
  return (
    typeof v.source === 'string' &&
    typeof v.name === 'string' &&
    typeof v.cosmetic === 'string' &&
    Array.isArray(v.accessories) &&
    v.accessories.every((a: unknown) => typeof a === 'string') &&
    (v.desk === null || typeof v.desk === 'string')
  );
}

function isWorldStats(v: unknown): v is WorldStats {
  if (!isObject(v)) return false;
  return (
    typeof v.totalCoinsEarned === 'number' &&
    typeof v.totalCoinsSpent === 'number' &&
    typeof v.totalWorkCompleted === 'number' &&
    typeof v.streakDays === 'number' &&
    typeof v.lastActiveDate === 'string' &&
    typeof v.timezone === 'string'
  );
}

function isCloudSync(v: unknown): v is CloudSync {
  if (!isObject(v)) return false;
  return (
    (v.lastSyncedAt === null || typeof v.lastSyncedAt === 'string') &&
    typeof v.syncSequence === 'number'
  );
}

export function validateWorldState(data: unknown): AgentvilleWorld | null {
  if (!isObject(data)) return null;
  if (data.schemaVersion !== 1) return null;
  if (typeof data.coins !== 'number') return null;
  if (!Array.isArray(data.inventory) || !data.inventory.every(isInventoryItem)) return null;
  if (!isWorldLayout(data.world)) return null;
  if (!isObject(data.agents)) return null;
  for (const val of Object.values(data.agents)) {
    if (!isAgentRecord(val)) return null;
  }
  if (!isWorldStats(data.stats)) return null;
  if (!isCloudSync(data.cloudSync)) return null;

  return data as unknown as AgentvilleWorld;
}
