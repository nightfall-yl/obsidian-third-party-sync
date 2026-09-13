/**
 * Pure entity type definitions with NO external module imports.
 *
 * `Entity` and `MixedEntity` are consumed by the sync planner
 * (src/syncer.ts). They are intentionally isolated in their own module
 * that imports nothing else so that their types can never degrade to `any`
 * when an upstream module fails to resolve its imports.
 *
 * src/baseTypes.ts imports from "obsidian" (for VALID_REQURL). When the
 * Obsidian community review sandbox type-checks without the obsidian stubs
 * installed, that broken import can cascade and degrade every export of
 * baseTypes.ts to `any`. Because `MixedEntity` embeds `Entity`
 * (`local?: Entity`, `remote?: Entity`, `prevSync?: Entity`), a degraded
 * `Entity` makes `MixedEntity` effectively `any`, which then trips
 * @typescript-eslint/no-unsafe-member-access on `syncPlan[key].local` in
 * src/syncer.ts. Keeping these two interfaces in an import-free module
 * guarantees they stay fully typed in every environment.
 */

export interface Entity {
  path: string;
  type: "file" | "folder";
  mtime?: number;
  size?: number;
  key?: string;
  keyRaw?: string;
  keyEnc?: string;
  mtimeCli?: number;
  mtimeSvr?: number;
  sizeEnc?: number;
  sizeRaw?: number;
  hash?: string | undefined;
  synthesizedFolder?: boolean;
}

export interface MixedEntity {
  path: string;
  type: "file" | "folder";
  mtime?: number;
  size?: number;
  existLocal?: boolean;
  existRemote?: boolean;
  local?: Entity;
  remote?: Entity;
  prevSync?: Entity;
  key?: string;
}
