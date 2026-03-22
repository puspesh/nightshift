# Plan: Migrate from js to typescript

> Issue: #2
> Date: 2026-03-22
> Status: draft

## Overview

Migrate all JavaScript source files (lib/, bin/, tests/) to TypeScript with strict mode enabled. This involves adding a `tsconfig.json`, renaming `.js` files to `.ts`, adding type annotations, updating imports, configuring the build pipeline to emit ESM JavaScript to a `dist/` directory, and updating `package.json` entry points to reference compiled output.

## Requirements

- Convert all `.js` files in `lib/`, `bin/`, and `tests/` to `.ts`
- Enable `strict: true` in `tsconfig.json`
- Add proper type annotations to all functions (replace JSDoc `@param`/`@returns` with TS types)
- Maintain all existing functionality -- no behavioral changes
- All existing tests must pass after migration
- Keep ESM module format (`"type": "module"` in package.json)
- Published package should ship compiled `.js` files, not `.ts` source

## Architecture Changes

### New files
- `tsconfig.json` -- TypeScript configuration with strict mode
- `tsconfig.build.json` -- Build-only config (excludes tests) for publishing

### File renames (14 files)
- `lib/detect.js` -> `lib/detect.ts`
- `lib/init.js` -> `lib/init.ts`
- `lib/copy.js` -> `lib/copy.ts`
- `lib/labels.js` -> `lib/labels.ts`
- `lib/teardown.js` -> `lib/teardown.ts`
- `lib/worktrees.js` -> `lib/worktrees.ts`
- `bin/nightshift.js` -> `bin/nightshift.ts`
- `tests/detect.test.js` -> `tests/detect.test.ts`
- `tests/copy.test.js` -> `tests/copy.test.ts`
- `tests/labels.test.js` -> `tests/labels.test.ts`
- `tests/profiles.test.js` -> `tests/profiles.test.ts`
- `tests/helpers.test.js` -> `tests/helpers.test.ts`
- `tests/worktrees.test.js` -> `tests/worktrees.test.ts`

### Modified files
- `package.json` -- add `typescript` devDependency, update `bin`, `scripts`, `files`
- `.gitignore` -- add `dist/`
- `.npmignore` -- add `tsconfig*.json`, `lib/`, `bin/`, `tests/` (source TS); include `dist/`

### Output structure
```
dist/
  lib/
    detect.js
    init.js
    copy.js
    labels.js
    teardown.js
    worktrees.js
  bin/
    nightshift.js
```

## Implementation Steps

### Phase 1: TypeScript setup and configuration

1. **Add TypeScript dependency** (`package.json`)
   - Action: Add `"typescript": "^5.7"` to `devDependencies`
   - Why: Required for compilation
   - Dependencies: none

2. **Create `tsconfig.json`** (project root)
   - Action: Create with the following configuration:
     ```json
     {
       "compilerOptions": {
         "target": "ES2022",
         "module": "NodeNext",
         "moduleResolution": "NodeNext",
         "strict": true,
         "esModuleInterop": true,
         "skipLibCheck": true,
         "forceConsistentCasingInFileNames": true,
         "outDir": "dist",
         "rootDir": ".",
         "declaration": true,
         "declarationMap": true,
         "sourceMap": true
       },
       "include": ["lib/**/*.ts", "bin/**/*.ts", "tests/**/*.ts"]
     }
     ```
   - Why: `strict: true` as required by the issue. `NodeNext` module resolution for ESM + Node.js compatibility. `outDir: dist` keeps compiled output separate from source.
   - Dependencies: none

3. **Create `tsconfig.build.json`** (project root)
   - Action: Create extending tsconfig.json but excluding tests:
     ```json
     {
       "extends": "./tsconfig.json",
       "include": ["lib/**/*.ts", "bin/**/*.ts"],
       "exclude": ["tests/**/*.ts"]
     }
     ```
   - Why: Published package shouldn't include test compilation artifacts
   - Dependencies: step 2

4. **Update `.gitignore`** (`.gitignore`)
   - Action: Add `dist/` line
   - Why: Compiled output should not be committed
   - Dependencies: none

5. **Update `.npmignore`** (`.npmignore`)
   - Action: Add `tsconfig*.json` and `tests/` to ignored files. Replace `node_modules/` line (already there) and ensure `dist/` is NOT ignored (it needs to be published)
   - Why: Published package ships dist/, not source .ts files
   - Dependencies: none

6. **Update `package.json`** (`package.json`)
   - Action:
     - Change `"bin"` from `"./bin/nightshift.js"` to `"./dist/bin/nightshift.js"`
     - Update `"files"` to include `"dist/"` and remove `"bin/"`, `"lib/"` (source TS no longer shipped)
     - Add scripts: `"build": "tsc -p tsconfig.build.json"`, `"typecheck": "tsc --noEmit"`
     - Update `"test"` to: `"node --test 'dist/tests/*.test.js'"` (run compiled tests) OR use `tsx` for direct TS test execution (see Assumptions)
   - Why: Entry points must reference compiled output
   - Dependencies: steps 2, 3

### Phase 2: Migrate source files (lib/)

7. **Migrate `lib/detect.ts`** (`lib/detect.js` -> `lib/detect.ts`)
   - Action:
     - Rename file
     - Add return types to all exported functions
     - Add parameter types (replace JSDoc with inline TS)
     - Remove JSDoc type annotations (keep description comments)
     - `detectPackageManager(repoRoot: string): string`
     - `detectRepoRoot(): string`
     - `detectRepoName(): string`
     - `detectMainBranch(): string`
     - `detectLanguage(repoRoot: string): string`
     - `detectScripts(repoRoot: string): { build: string | null; test: string | null; lint: string | null; typecheck: string | null }`
     - `validateTeamName(name: string): boolean`
     - `detectRemote(): string`
   - Why: This module has no internal dependencies -- safe to migrate first
   - Dependencies: step 2

8. **Migrate `lib/labels.ts`** (`lib/labels.js` -> `lib/labels.ts`)
   - Action:
     - Rename file
     - Define `Label` interface: `{ status: string; color: string; description: string }`
     - Type function signatures:
       - `loadLabels(presetDir: string): Label[]`
       - `createLabels(team: string, presetDir: string): number`
       - `removeLabels(team: string): number`
   - Why: Only depends on Node.js built-ins
   - Dependencies: step 2

9. **Migrate `lib/worktrees.ts`** (`lib/worktrees.js` -> `lib/worktrees.ts`)
   - Action:
     - Rename file
     - Type all function signatures:
       - `getNightshiftDir(repoName: string): string`
       - `getTeamDir(repoName: string, team: string): string`
       - `createWorktrees(repoName: string, team: string, roles: string[], mainBranch: string): void`
       - `removeWorktrees(repoName: string, team: string): void`
       - `discoverCoderCount(repoName: string, team: string): number`
       - `discoverTeams(repoName: string): string[]`
   - Why: Only depends on Node.js built-ins
   - Dependencies: step 2

10. **Migrate `lib/copy.ts`** (`lib/copy.js` -> `lib/copy.ts`)
    - Action:
      - Rename file
      - Define `CopyResult` interface: `{ copied: string[]; skipped: string[] }`
      - Type all function signatures:
        - `getPresetDir(team: string): string`
        - `getPresetAgentsDir(team: string): string`
        - `getPresetDefaultsDir(team: string): string`
        - `getDefaultsDir(): string`
        - `getGlobalAgentsDir(): string`
        - `copyAgentProfiles(team: string, coderCount: number): string[]`
        - `copyExtensionFiles(repoRoot: string, team: string): CopyResult`
        - `copyRepoMd(repoRoot: string, content: string): boolean`
        - `removeAgentProfiles(team: string): string[]`
        - `removeExtensionFiles(repoRoot: string, team: string): string[]`
        - `removeRepoMd(repoRoot: string): boolean`
    - Why: Depends on path utilities only
    - Dependencies: step 2

11. **Migrate `lib/init.ts`** (`lib/init.js` -> `lib/init.ts`)
    - Action:
      - Rename file
      - Type local functions: `isAvailable(cmd: string): boolean`, `printBanner(): void`, `parseFlag(args: string[], flag: string): string | null`, `listAvailablePresets(): string[]`
      - Type exported functions:
        - `generateRepoMd(packageManager: string, language: string, scripts: { build: string | null; test: string | null; lint: string | null; typecheck: string | null }, mainBranch: string, skipPrompts: boolean): Promise<string>`
        - `appendClaudeMd(repoRoot: string, repoName: string, team: string, coderCount: number): void`
        - `init(args: string[]): Promise<void>`
      - Type `buildTeamSubsection(team: string, repoName: string, coderCount: number): string`
      - Handle `prompts` library typing -- may need `@types/prompts` or cast as needed
    - Why: Depends on detect.ts, labels.ts, worktrees.ts, copy.ts -- migrate after them
    - Dependencies: steps 7, 8, 9, 10

12. **Migrate `lib/teardown.ts`** (`lib/teardown.js` -> `lib/teardown.ts`)
    - Action:
      - Rename file
      - Type functions:
        - `parseFlag(args: string[], flag: string): string | null`
        - `cleanClaudeMd(repoRoot: string, team: string): void`
        - `teardown(args: string[]): Promise<void>`
      - Handle `prompts` library typing
    - Why: Depends on detect.ts, labels.ts, worktrees.ts, copy.ts
    - Dependencies: steps 7, 8, 9, 10

### Phase 3: Migrate entry point and tests

13. **Migrate `bin/nightshift.ts`** (`bin/nightshift.js` -> `bin/nightshift.ts`)
    - Action:
      - Rename file
      - Add types to `printHelp(): void`, `printVersion(): void`, `list(): Promise<void>`, `main(): Promise<void>`
      - Type the dynamic imports in switch/case (the return types from `import()`)
      - Ensure shebang `#!/usr/bin/env node` is preserved (will be in compiled output)
    - Why: Entry point, depends on lib modules
    - Dependencies: steps 11, 12

14. **Migrate `tests/detect.test.ts`** (`tests/detect.test.js` -> `tests/detect.test.ts`)
    - Action: Rename and add minimal types (test files generally need fewer annotations with strict mode since `node:test` and `node:assert` are well-typed)
    - Why: Tests for detect module
    - Dependencies: step 7

15. **Migrate `tests/copy.test.ts`** (`tests/copy.test.js` -> `tests/copy.test.ts`)
    - Action: Rename and add types
    - Dependencies: step 10

16. **Migrate `tests/labels.test.ts`** (`tests/labels.test.js` -> `tests/labels.test.ts`)
    - Action: Rename and add types
    - Dependencies: step 8

17. **Migrate `tests/profiles.test.ts`** (`tests/profiles.test.js` -> `tests/profiles.test.ts`)
    - Action: Rename and add types. Define a `Profile` type: `{ name: string; content: string }`
    - Dependencies: step 2

18. **Migrate `tests/helpers.test.ts`** (`tests/helpers.test.js` -> `tests/helpers.test.ts`)
    - Action: Rename and add types
    - Dependencies: steps 11, 12

19. **Migrate `tests/worktrees.test.ts`** (`tests/worktrees.test.js` -> `tests/worktrees.test.ts`)
    - Action: Rename and add types
    - Dependencies: step 9

### Phase 4: Update imports and build verification

20. **Update all import paths** (all `.ts` files)
    - Action: Change `import ... from './foo.js'` to `import ... from './foo.js'` -- **keep the `.js` extension**. With `NodeNext` module resolution, TypeScript requires `.js` extensions in imports even for `.ts` source files. This is a common gotcha.
    - Why: NodeNext resolution requires explicit `.js` extensions that map to the compiled output
    - Dependencies: steps 7-19

21. **Add `@types/node` devDependency** (`package.json`)
    - Action: Add `"@types/node": "^22"` to `devDependencies`
    - Why: Required for Node.js API types (`node:fs`, `node:child_process`, etc.)
    - Dependencies: step 1

22. **Add `@types/prompts` devDependency** (`package.json`)
    - Action: Check if `@types/prompts` exists on npm. If yes, add it. If not, create a `types/prompts.d.ts` declaration file.
    - Why: `prompts` is used in init.ts and teardown.ts; strict mode requires types
    - Dependencies: step 1

23. **Run typecheck** (project root)
    - Action: Run `npx tsc --noEmit` and fix all type errors
    - Why: Verify the migration is type-safe
    - Dependencies: steps 7-22

24. **Build and test** (project root)
    - Action: Run `npx tsc -p tsconfig.build.json` then `node --test dist/tests/*.test.js` (or the configured test command)
    - Why: Verify compiled output works correctly
    - Dependencies: step 23

25. **Verify the CLI entry point** (project root)
    - Action: Run `node dist/bin/nightshift.js --help` and `node dist/bin/nightshift.js --version`
    - Why: Ensure the compiled CLI works
    - Dependencies: step 24

## Testing Strategy

- **Typecheck**: `tsc --noEmit` must pass with zero errors (this is the primary new test)
- **Unit tests**: All 6 test files must pass after compilation. Run via `node --test dist/tests/*.test.js`
- **Integration**: Run `node dist/bin/nightshift.js --help` to verify CLI entry point
- **Regression**: The test output and behavior must match pre-migration behavior exactly

## Assumptions

- **Test runner approach**: The project uses `node:test` which is Node.js's built-in test runner. With TypeScript, we have two options:
  1. **Compile first, then test**: `tsc && node --test dist/tests/*.test.js` -- reliable, but requires a build step before testing
  2. **Use `tsx` for direct execution**: Add `tsx` as a devDependency and run `tsx --test tests/*.test.ts` -- faster dev loop, no build step for tests
  - **Decision**: Use option 1 (compile then test) for CI/scripts, but document option 2 in CONTRIBUTING.md for developer convenience. This keeps the dependency footprint minimal.

- **Import extensions**: TypeScript with `NodeNext` requires `.js` extensions in import specifiers even though the source files are `.ts`. This is intentional and correct -- the imports resolve to the compiled `.js` output. The existing imports already use `.js` extensions, so **no import path changes are needed**.

- **`prompts` library types**: The `prompts` npm package has `@types/prompts` available (it's a popular package). If it doesn't exist or has issues, we'll create a minimal `types/prompts.d.ts`.

- **`chalk` library types**: Chalk v5 ships with built-in TypeScript types (it's written in TS). No additional `@types` package needed.

- **No changes to markdown/preset files**: The `.md` files in `presets/`, `defaults/`, `docs/`, and `examples/` are not TypeScript and don't need migration. Only the `.js` source and test files are in scope.

- **`files` array in package.json**: The published package will ship `dist/` instead of raw `lib/` and `bin/`. The `presets/`, `defaults/`, `examples/`, `docs/` directories still ship as-is since they contain markdown and JSON, not TypeScript.

## Risks & Mitigations

- **Risk**: `strict: true` may surface latent type issues that require code changes beyond simple annotation
  - Mitigation: The codebase is small (6 lib files, ~800 lines total) and well-structured. Most functions have clear input/output types documented in JSDoc. Strict mode issues should be straightforward to resolve.

- **Risk**: `node:test` type definitions may have gaps or quirks
  - Mitigation: `@types/node` v22+ includes complete `node:test` types. If any issues arise, use type assertions as a last resort.

- **Risk**: Compiled output paths change, breaking the `bin` entry point for global installs
  - Mitigation: Update `package.json` `"bin"` to `"./dist/bin/nightshift.js"` and verify with `node dist/bin/nightshift.js --help`. The shebang line must be preserved in the compiled output (TypeScript preserves shebangs).

- **Risk**: Dynamic imports in `bin/nightshift.ts` (e.g., `await import('../lib/init.js')`) may need path adjustments
  - Mitigation: Since compiled output mirrors source structure (`dist/bin/nightshift.js` imports `../lib/init.js` which resolves to `dist/lib/init.js`), relative paths should work unchanged. Verify during build step.

- **Risk**: Test files import from `../lib/` using relative paths -- compiled test output in `dist/tests/` must still resolve to `dist/lib/`
  - Mitigation: The directory structure is flat (no nesting beyond one level), so `../lib/foo.js` from `dist/tests/` correctly resolves to `dist/lib/foo.js`. Verify in step 24.
