/**
 * Workaround for running the Medusa integration test suite on this machine.
 *
 * The real workspace path (C:\Users\mosho\Desktop\How's you) contains an
 * apostrophe, which breaks fast-glob's absolute-pattern matching for patterns
 * containing braces — e.g. MikroORM's migration glob `!(*.d).{js,ts,cjs}`
 * returns 0 matches, so test databases are created with no tables.
 *
 * A subst drive (or junction) avoids the apostrophe, but jest resolves every
 * module through graceful-fs `realpathSync.native`, which dereferences subst
 * drives/junctions back to the real path. This preload (via NODE_OPTIONS
 * --require) rewrites those results back onto the alias drive so the
 * apostrophe never re-enters module paths.
 *
 * Only active when HOWSU_REAL_PATH and HOWSU_ALIAS_PATH are set.
 */
"use strict"

const REAL = process.env.HOWSU_REAL_PATH
const ALIAS = process.env.HOWSU_ALIAS_PATH

if (REAL && ALIAS) {
  const realLower = REAL.toLowerCase()

  const remap = (result) => {
    if (
      typeof result === "string" &&
      result.toLowerCase().startsWith(realLower)
    ) {
      return ALIAS + result.slice(REAL.length)
    }
    return result
  }

  const patchSyncNative = (fsLike) => {
    if (!fsLike?.realpathSync?.native) return
    const original = fsLike.realpathSync.native
    fsLike.realpathSync.native = function (...args) {
      return remap(original.apply(this, args))
    }
  }

  patchSyncNative(require("fs"))
  try {
    patchSyncNative(require("graceful-fs"))
  } catch {
    // graceful-fs not installed — nothing else to patch
  }
}
