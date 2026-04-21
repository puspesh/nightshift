export declare type AgentAction = {
    type: 'move';
    to: string;
} | {
    type: 'speak';
    message: string;
    to?: string;
} | {
    type: 'emote';
    emote: string;
} | {
    type: 'status';
    state: AgentState;
    task?: string | null;
    energy?: number;
} | {
    type: 'message';
    to: string | string[];
    message: string;
} | {
    type: 'join_channel';
    channel: string;
} | {
    type: 'leave_channel';
    channel: string;
};

export declare type AgentState = 'working' | 'idle' | 'thinking' | 'error' | 'waiting' | 'collaborating' | 'sleeping' | 'listening' | 'speaking' | 'offline';

export declare interface AgentStatus {
    id: string;
    name: string;
    state: AgentState;
    task: string | null;
    energy: number;
    metadata?: Record<string, unknown>;
}

export declare interface Anchor {
    name: string;
    ox: number;
    oy: number;
    type: AnchorType;
}

export declare const ANCHOR_COLORS: Record<AnchorType, string>;

export declare const ANCHOR_TYPES: AnchorType[];

export declare type AnchorType = 'work' | 'rest' | 'social' | 'utility' | 'wander';

export declare interface AnimationDef {
    sheet: string;
    row: number;
    frames: number;
    speed: number;
}

export declare class Animator {
    private currentAnimation;
    private frame;
    private elapsed;
    private spriteSheet;
    constructor(spriteSheet: SpriteSheet, initialAnimation?: string);
    play(animation: string): void;
    getCurrentAnimation(): string;
    update(delta: number): void;
    draw(ctx: CanvasRenderingContext2D, x: number, y: number): void;
}

declare interface BubbleTarget {
    x: number;
    y: number;
    getSittingOffset(): number;
}

export declare class Camera {
    x: number;
    y: number;
    zoom: number;
    private targetX;
    private targetY;
    private smoothing;
    setPosition(x: number, y: number): void;
    snapTo(x: number, y: number): void;
    update(): void;
    apply(ctx: CanvasRenderingContext2D): void;
    screenToWorld(screenX: number, screenY: number): {
        x: number;
        y: number;
    };
}

export declare class Citizen {
    readonly agentId: string;
    readonly name: string;
    readonly animator: Animator;
    readonly spriteSheet: SpriteSheet;
    x: number;
    y: number;
    state: AgentState;
    task: string | null;
    energy: number;
    visible: boolean;
    /** Separation steering offset (pixels), applied during rendering */
    separationX: number;
    separationY: number;
    private path;
    private pathIndex;
    private moveSpeed;
    private moveProgress;
    private homePosition;
    private tileWidth;
    private tileHeight;
    private frameWidth;
    private frameHeight;
    private idleBehaviorTimer;
    private idleBehaviorInterval;
    private currentAnchor;
    readonly isNpc: boolean;
    private npcPhase;
    private npcPhaseTimer;
    private npcPhaseDuration;
    constructor(config: CitizenConfig, spriteSheet: SpriteSheet, tileWidth: number, tileHeight: number);
    getHomePosition(): string;
    setHomePosition(position: string): void;
    setPixelPosition(x: number, y: number): void;
    setTilePosition(tileX: number, tileY: number): void;
    getTilePosition(): {
        x: number;
        y: number;
    };
    walkTo(path: {
        x: number;
        y: number;
    }[]): void;
    isMoving(): boolean;
    updateState(state: AgentState, task: string | null, energy: number): void;
    faceDirection(dir: 'up' | 'down' | 'left' | 'right'): void;
    update(delta: number, pathfinder: Pathfinder, locations: Record<string, {
        x: number;
        y: number;
    }>, typedLocations?: TypedLocation[], reservation?: TileReservation, excludeNames?: Set<string>): void;
    /** NPC phase cycling: idle/wander → working → idle/wander → resting → repeat */
    private updateNpcPhase;
    private updateMovement;
    /** Navigate to a specific anchor by name */
    goToAnchor(anchorName: string, typedLocations: TypedLocation[], pathfinder: Pathfinder, reservation?: TileReservation): boolean;
    /** Navigate to a specific anchor by type, respecting reservation */
    goToAnchorType(type: AnchorType, typedLocations: TypedLocation[], pathfinder: Pathfinder, reservation?: TileReservation, excludeNames?: Set<string>): boolean;
    getCurrentAnchor(): string | null;
    private updateIdleBehavior;
    /** Pick a random walkable tile and walk there */
    walkToRandomTile(pathfinder: Pathfinder, reservation?: TileReservation): void;
    /** Clear the current anchor (e.g. when navigation to a work/rest anchor fails) */
    clearAnchor(): void;
    /** Y offset applied when the character is sitting (working/sleeping) at an anchor */
    getSittingOffset(): number;
    /** Whether this citizen is anchored (sitting) and should not be pushed by separation */
    isAnchored(): boolean;
    /**
     * Apply separation steering: push away from nearby citizens.
     * Call once per frame from the update loop, passing all other citizens.
     */
    applySeparation(others: Citizen[], delta: number): void;
    draw(ctx: CanvasRenderingContext2D): void;
    containsPoint(px: number, py: number): boolean;
}

export declare interface CitizenConfig {
    agentId: string;
    name: string;
    sprite: string;
    position: string;
    npc?: boolean;
}

export declare interface CitizenDef {
    agentId: string;
    name: string;
    sprite: string;
    position: string;
    type: 'npc' | 'agent';
}

/** Combined layer — legacy compat */
export declare class CitizenLayer implements RenderLayer {
    readonly order = 10;
    private below;
    private above;
    constructor();
    setCitizens(citizens: Citizen[]): void;
    getLayers(): RenderLayer[];
    render(_ctx: CanvasRenderingContext2D, _delta: number): void;
}

export declare interface CitizenSnapshot {
    agentId: string;
    name: string;
    state: AgentState;
    task: string | null;
    energy: number;
    position: string | null;
    tileX: number;
    tileY: number;
    isNpc: boolean;
    moving: boolean;
}

/** Messages from agent to server */
export declare type ClientMessage = {
    type: 'action';
    agent: string;
    action: AgentAction;
} | {
    type: 'observe';
    agent: string;
    since?: number;
};

/** Standard sprite sheet config for a citizen using walk + actions convention */
export declare function createStandardSpriteConfig(sprite: string): SpriteSheetConfig;

/** Deadspace marker — empty string means "void / no tile". */
export declare const DEADSPACE = "";

export declare class Editor {
    private active;
    private tab;
    private canvas;
    private scale;
    private tileSize;
    private props;
    private mv;
    private worldId;
    private saveFn;
    private apiBase;
    private wrapper;
    private panel;
    private tabBtns;
    private tabContent;
    private undoStack;
    private redoStack;
    private maxHistory;
    private preActionSnapshot;
    private selectedCitizenId;
    /** Tracks NPC vs Agent per agentId. Default is 'agent' for backwards compat. */
    private citizenTypes;
    /** Tracks sprite key per agentId */
    private citizenSprites;
    private selAnchorPiece;
    private selAnchorIdx;
    private draggingAnchor;
    private dragAnchorOx;
    private dragAnchorOy;
    private genType;
    private genStatus;
    private genPreview;
    private genBusy;
    constructor(config: EditorConfig);
    isActive(): boolean;
    getTab(): EditorTab;
    renderOverlay(ctx: CanvasRenderingContext2D): void;
    private renderGrid;
    private selectedTileKey;
    /** @deprecated No longer needed — tileMap keys are the names. */
    setTileNames(_names: Record<number, string>): void;
    private renderWorldOverlay;
    private buildWorldTab;
    private paintTile;
    private renderPropsOverlay;
    private renderCitizensOverlay;
    private renderBehaviorOverlay;
    private drawAnchorDot;
    private buildPanel;
    private updateTabStyles;
    private switchTab;
    private buildTabContent;
    private refreshTabContent;
    private propsInfo;
    private buildPropsTab;
    private refreshPropsTab;
    private citizensInfo;
    private citizensList;
    private buildCitizensTab;
    private showAddCitizenUI;
    private rebuildCitizensList;
    private citizensBuiltFor;
    private refreshCitizensTab;
    private stateColor;
    private behaviorInfo;
    private buildBehaviorTab;
    private refreshBehaviorTab;
    private buildGenerateTab;
    private toWorld;
    private painting;
    private onMouseDown;
    private onMouseMove;
    private onMouseUp;
    private pickCitizen;
    private pickAnchor;
    private onKeyDown;
    private handleBehaviorKey;
    private captureState;
    private restoreState;
    private beginAction;
    private commitAction;
    private undo;
    private redo;
    private buildSceneSnapshot;
    saveScene(): Promise<void>;
    loadCitizenDefs(defs?: CitizenDef[]): void;
    private gridLabel;
    private resizeGrid;
    private makeBtn;
    private el;
    destroy(): void;
}

export declare interface EditorConfig {
    canvas: HTMLCanvasElement;
    props: PropSystem;
    miniverse: Agentville;
    worldId?: string;
    onSave?: SaveSceneFn;
    /** Base URL for generation API (default: http://localhost:4321) */
    apiBase?: string;
}

export declare type EditorTab = 'world' | 'props' | 'citizens' | 'behavior' | 'generate';

export declare type EventCallback = (event: {
    id: number;
    timestamp: number;
    agentId: string;
    action: Record<string, unknown>;
}) => void;

export declare class InteractiveObject {
    readonly config: ObjectConfig;
    private active;
    private shakeTimer;
    private glowing;
    private displayText;
    constructor(config: ObjectConfig);
    activate(): void;
    deactivate(): void;
    setGlow(on: boolean): void;
    setText(text: string): void;
    isActive(): boolean;
    containsPoint(px: number, py: number): boolean;
    update(delta: number): void;
    draw(ctx: CanvasRenderingContext2D): void;
}

export declare interface LoadedPiece extends PropPiece {
    img: HTMLImageElement;
    anchors: Anchor[];
}

export declare interface LocationSnapshot {
    name: string;
    x: number;
    y: number;
    type: string;
}

export declare type MessageCallback = (msg: {
    from: string;
    message: string;
    channel?: string;
}) => void;

export declare class Agentville {
    private renderer;
    private scene;
    private citizens;
    private citizenLayer;
    private objects;
    private particles;
    private speechBubbles;
    private signal;
    private config;
    private eventHandlers;
    private particleTimers;
    private typedLocations;
    private reservation;
    /** Agent IDs currently being spawned (to avoid duplicate async addCitizen calls) */
    private spawningAgents;
    private autoSpawnIndex;
    constructor(config: AgentvilleConfig);
    start(): Promise<void>;
    /** Nudge any citizen that can't pathfind to any destination to the nearest open tile */
    private unstickCitizens;
    stop(): void;
    getCanvas(): HTMLCanvasElement;
    addLayer(layer: {
        order: number;
        render(ctx: CanvasRenderingContext2D, delta: number): void;
    }): void;
    on(event: AgentvilleEvent, handler: (data: unknown) => void): void;
    off(event: AgentvilleEvent, handler: (data: unknown) => void): void;
    private emit;
    triggerEvent(type: string, data?: Record<string, unknown>): void;
    setTypedLocations(locations: TypedLocation[]): void;
    /** Resize the grid by expanding right/down. Existing coords stay the same. */
    resizeGrid(newCols: number, newRows: number): void;
    getGridSize(): {
        cols: number;
        rows: number;
    };
    getFloorLayer(): string[][];
    getWalkableGrid(): boolean[][];
    setTile(col: number, row: number, tileKey: string): void;
    getTiles(): Record<string, string>;
    getTileImages(): Map<string, HTMLImageElement>;
    addTile(key: string, img: HTMLImageElement, src?: string): void;
    /** Update walkability grid: reset to base then overlay blocked tiles */
    updateWalkability(blockedTiles: Set<string>): void;
    getReservation(): TileReservation;
    getCitizen(agentId: string): Citizen | undefined;
    getCitizens(): Citizen[];
    getSpriteSheetKeys(): string[];
    getSpriteSheetConfig(key: string): SpriteSheetConfig | undefined;
    getBasePath(): string;
    addCitizen(config: CitizenConfig, sheetConfig?: SpriteSheetConfig): Promise<Citizen>;
    removeCitizen(agentId: string): void;
    /** Timestamps of last movement transition per citizen, for debouncing */
    private lastTransitionTime;
    private static readonly TRANSITION_DEBOUNCE_MS;
    private handleSignalUpdate;
    private autoSpawnCitizen;
    /** Returns anchor names assigned as home positions to other citizens */
    private getOtherHomeAnchors;
    private handleStateTransition;
    private updateCitizenEffects;
    private handleClick;
}

export declare interface AgentvilleConfig {
    container: HTMLElement;
    world: string;
    scene: string;
    signal: SignalConfig;
    citizens: CitizenConfig[];
    scale?: number;
    width?: number;
    height?: number;
    worldBasePath?: string;
    spriteSheets?: Record<string, SpriteSheetConfig>;
    sceneConfig?: SceneConfig;
    objects?: ObjectConfig[];
    /** Sprite names to cycle through when auto-creating citizens for new agents */
    defaultSprites?: string[];
    /** Set to false to disable auto-creating citizens for unknown agents (default: true) */
    autoSpawn?: boolean;
}

declare type AgentvilleEvent = 'citizen:click' | 'object:click' | 'intercom';

export declare interface NamedLocation {
    x: number;
    y: number;
    label: string;
}

export declare interface ObjectConfig {
    id: string;
    type: 'intercom' | 'whiteboard' | 'monitor' | 'coffee_machine' | 'generic';
    x: number;
    y: number;
    width: number;
    height: number;
    label?: string;
}

export declare class ParticleSystem implements RenderLayer {
    readonly order = 20;
    private particles;
    emitZzz(x: number, y: number): void;
    emitExclamation(x: number, y: number): void;
    emitThought(x: number, y: number): void;
    update(delta: number): void;
    render(ctx: CanvasRenderingContext2D, delta: number): void;
}

export declare class Pathfinder {
    private grid;
    constructor(walkableGrid: boolean[][]);
    private get height();
    private get width();
    findPath(startX: number, startY: number, endX: number, endY: number): {
        x: number;
        y: number;
    }[];
    private isWalkable;
    /** Returns all walkable tile coordinates (cached after first call) */
    private walkableCache;
    getWalkableTiles(): {
        x: number;
        y: number;
    }[];
    private heuristic;
    private reconstructPath;
}

export declare type PropLayout = PropPiece[];

export declare interface PropPiece {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    layer: 'below' | 'above';
    anchors?: Anchor[];
}

export declare interface PropSnapshot {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

export declare class PropSystem {
    pieces: LoadedPiece[];
    selected: Set<LoadedPiece>;
    wanderPoints: {
        name: string;
        x: number;
        y: number;
    }[];
    private images;
    private imageSrcs;
    private tileSize;
    private scale;
    private dragging;
    private dragOffsets;
    private clipboard;
    private onSaveCallback;
    private deadspaceCheck;
    constructor(tileSize: number, scale: number);
    loadSprite(id: string, src: string): Promise<void>;
    getImageSrcs(): Map<string, string>;
    getTileSize(): number;
    getScale(): number;
    setLayout(layout: PropLayout): void;
    getLayout(): PropLayout;
    getLocations(): TypedLocation[];
    getLocationMap(): Record<string, {
        x: number;
        y: number;
        label: string;
    }>;
    onSave(callback: () => void): void;
    setDeadspaceCheck(check: (col: number, row: number) => boolean): void;
    occupiesTile(col: number, row: number): boolean;
    private overlapsDeadspace;
    getBlockedTiles(): Set<string>;
    setWanderPoints(points: {
        name: string;
        x: number;
        y: number;
    }[]): void;
    save(): void;
    addPiece(id: string): LoadedPiece | null;
    removePiece(piece: LoadedPiece): void;
    renderBelow(ctx: CanvasRenderingContext2D): void;
    renderAbove(ctx: CanvasRenderingContext2D): void;
    handleMouseDown(wx: number, wy: number, shiftKey?: boolean): boolean;
    handleMouseMove(wx: number, wy: number): void;
    handleMouseUp(): void;
    handleKey(e: KeyboardEvent): boolean;
    pieceAt(wx: number, wy: number): LoadedPiece | null;
    private snap;
}

export declare class Renderer {
    readonly canvas: HTMLCanvasElement;
    readonly ctx: CanvasRenderingContext2D;
    readonly camera: Camera;
    private layers;
    private animationId;
    private lastTime;
    private scale;
    constructor(container: HTMLElement, width: number, height: number, scale: number);
    addLayer(layer: RenderLayer): void;
    removeLayer(layer: RenderLayer): void;
    start(): void;
    stop(): void;
    private render;
    resize(width: number, height: number): void;
    getScale(): number;
    screenToWorld(screenX: number, screenY: number): {
        x: number;
        y: number;
    };
}

export declare interface RenderLayer {
    order: number;
    render(ctx: CanvasRenderingContext2D, delta: number): void;
}

export declare type SaveSceneFn = (scene: SceneSnapshot) => Promise<void>;

export declare class Scene implements RenderLayer {
    readonly order = 0;
    readonly config: SceneConfig;
    readonly pathfinder: Pathfinder;
    private tileImages;
    private loaded;
    constructor(config: SceneConfig);
    load(basePath: string): Promise<void>;
    getLocation(name: string): NamedLocation | undefined;
    getTileImages(): Map<string, HTMLImageElement>;
    addTile(key: string, img: HTMLImageElement): void;
    render(ctx: CanvasRenderingContext2D, _delta: number): void;
}

export declare interface SceneConfig {
    name: string;
    tileWidth: number;
    tileHeight: number;
    /** String-keyed floor grid. Each cell is a tile key or DEADSPACE (""). */
    layers: string[][][];
    walkable: boolean[][];
    locations: Record<string, NamedLocation>;
    /** Map of tile key → image path (e.g. { "oak_planks": "tiles/oak_planks.png" }) */
    tiles: Record<string, string>;
}

export declare interface SceneSnapshot {
    worldId?: string;
    gridCols: number;
    gridRows: number;
    floor: string[][];
    tiles: Record<string, string>;
    props: PropLayout;
    wanderPoints: {
        name: string;
        x: number;
        y: number;
    }[];
    propImages?: Record<string, string>;
    citizens?: CitizenDef[];
}

/** Messages from server to agent/client */
export declare type ServerMessage = {
    type: 'agents';
    agents: unknown[];
} | {
    type: 'world';
    snapshot: WorldSnapshot;
} | {
    type: 'event';
    event: WorldEvent;
} | {
    type: 'message';
    from: string;
    message: string;
    channel?: string;
};

export declare class Signal {
    private config;
    private callbacks;
    private eventCallbacks;
    private messageCallbacks;
    private intervalId;
    private ws;
    constructor(config: SignalConfig);
    onUpdate(cb: SignalCallback): void;
    /** Register callback for world events (interactive mode) */
    onEvent(cb: EventCallback): void;
    /** Register callback for direct/channel messages */
    onMessage(cb: MessageCallback): void;
    /** Send an action to the server (interactive mode, WebSocket only) */
    sendAction(agentId: string, action: Record<string, unknown>): void;
    /** Request a world snapshot (interactive mode, WebSocket only) */
    requestObserve(agentId: string, sinceEventId?: number): void;
    private emit;
    private emitEvent;
    private emitMessage;
    start(): void;
    stop(): void;
    private startPolling;
    private startWebSocket;
    private startMock;
}

export declare type SignalCallback = (agents: AgentStatus[]) => void;

export declare interface SignalConfig {
    type: 'rest' | 'websocket' | 'mock';
    url?: string;
    interval?: number;
    mockData?: () => AgentStatus[];
}

export declare class SpeechBubbleSystem implements RenderLayer {
    readonly order = 25;
    private bubbles;
    show(x: number, y: number, text: string, duration?: number, target?: BubbleTarget): void;
    clear(): void;
    render(ctx: CanvasRenderingContext2D, delta: number): void;
}

export declare class SpriteSheet {
    private images;
    private loaded;
    readonly config: SpriteSheetConfig;
    constructor(config: SpriteSheetConfig);
    load(basePath: string): Promise<void>;
    getImage(sheetKey: string): HTMLImageElement | undefined;
    isLoaded(): boolean;
    drawFrame(ctx: CanvasRenderingContext2D, animationName: string, frame: number, x: number, y: number): void;
}

export declare interface SpriteSheetConfig {
    sheets: Record<string, string>;
    animations: Record<string, AnimationDef>;
    frameWidth: number;
    frameHeight: number;
}

/** Maps tile "x,y" → agentId that currently claims it.
 *  Supports workstation grouping: nearby work anchors are treated as one unit. */
export declare class TileReservation {
    private map;
    /** Groups of tile keys that belong to the same workstation */
    private groups;
    private key;
    /** Build workstation groups from typed locations.
     *  Work anchors within maxDist tiles of each other are paired —
     *  reserving one reserves the whole group. */
    setAnchorGroups(locations: TypedLocation[], maxDist?: number): void;
    private getGroup;
    reserve(x: number, y: number, agentId: string): boolean;
    release(agentId: string): void;
    isAvailable(x: number, y: number, agentId: string): boolean;
}

export declare interface TypedLocation {
    name: string;
    x: number;
    y: number;
    type: AnchorType;
}

export declare interface WorldEvent {
    id: number;
    timestamp: number;
    agentId: string;
    action: AgentAction;
}

export declare interface WorldSnapshot {
    /** World identifier */
    worldId: string;
    /** Grid dimensions */
    gridCols: number;
    gridRows: number;
    /** All citizens and their current state */
    citizens: CitizenSnapshot[];
    /** Named locations / anchors */
    locations: LocationSnapshot[];
    /** Props in the world */
    props: PropSnapshot[];
    /** Recent events since lastEventId (or last 50) */
    events: WorldEvent[];
    /** ID of the latest event (for polling) */
    lastEventId: number;
}

/** @deprecated Use Agentville */
export { Agentville as Miniverse };
/** @deprecated Use AgentvilleConfig */
export type { AgentvilleConfig as MiniverseConfig };
/** @deprecated Use AgentvilleEvent */
export type { AgentvilleEvent as MiniverseEvent };

export { }
