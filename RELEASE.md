# neiro — Release & Publishing Guide

How to package and publish neiro to npm.

## Pre-release Checklist

Before publishing, make sure everything is green:

```bash
bun run typecheck       # No type errors
bun run test            # All tests pass
bun run test:coverage   # Coverage > 90%
bun run build           # Build succeeds
```

## Build Output

`bun run build` produces the following in `dist/`:

```
dist/
├── index.js      # ESM bundle (import)
├── index.cjs     # CJS bundle (require)
├── index.d.ts    # Bundled type declarations
└── index.js.map  # Source map
```

These are configured in `package.json`:

```json
{
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  }
}
```

Only the `dist/` folder is published (controlled by the `files` field).

## Verify the Package Contents

Before publishing, inspect exactly what will be included in the package:

```bash
npm pack --dry-run
```

This lists every file that would be in the tarball. You should see:

```
dist/index.js
dist/index.cjs
dist/index.d.ts
dist/index.js.map
package.json
README.md
```

No `src/`, no `tests/`, no `node_modules/`.

To create the tarball locally and inspect it:

```bash
npm pack
tar -tzf neiro-0.1.0.tgz
```

## Test the Package Locally

Before publishing to npm, test the package in a real project:

```bash
# 1. Build the package
bun run build

# 2. Pack it into a tarball
npm pack

# 3. In another project, install from the tarball
cd /path/to/test-project
bun add /path/to/neiro/neiro-0.1.0.tgz
```

Then write a quick test script:

```typescript
import { AudioTrack } from "neiro";
import { readFileSync } from "fs";

const buffer = readFileSync("test.mp3");
const track = await AudioTrack.fromBuffer(buffer);
console.log(`Loudness: ${track.loudness()} LUFS`);
console.log(`Duration: ${track.duration}s`);

const normalized = track.normalize({ target: -14 });
console.log(`Normalized: ${normalized.loudness()} LUFS`);
```

Verify:

- Import resolves correctly
- Types work in the editor (hover over methods, autocomplete)
- Runtime works — no missing modules or broken imports
- Both ESM (`import`) and CJS (`require`) work if you need to support both

## npm Account Setup

If you don't have an npm account:

```bash
npm adduser
```

If you have an account but aren't logged in:

```bash
npm login
```

Verify you're logged in:

```bash
npm whoami
```

## Publishing

### First Release

```bash
# Make sure version is correct in package.json
# (should be 0.1.0 for the first release)

# Build
bun run build

# Publish (public package)
npm publish --access public
```

The `--access public` flag is needed for scoped packages or first-time publishes to ensure the package isn't accidentally private.

### Subsequent Releases

```bash
# Bump version
npm version patch   # 0.1.0 → 0.1.1 (bug fixes)
npm version minor   # 0.1.1 → 0.2.0 (new features, backwards compatible)
npm version major   # 0.2.0 → 1.0.0 (breaking changes)

# Build and publish
bun run build
npm publish
```

`npm version` updates `package.json` and creates a git tag automatically.

## Versioning Strategy

Follow [semver](https://semver.org/):

- **0.x.y** — Pre-1.0, anything can change. Use this while iterating on the API.
- **0.1.0** — First usable release. API is defined but may evolve.
- **1.0.0** — Stable API. You're committing to backwards compatibility.

Suggested milestones:

| Version | Milestone                                                  |
| ------- | ---------------------------------------------------------- |
| `0.1.0` | Core API works: normalize, trim, fade, gain, slice, export |
| `0.2.0` | concat, mix, reverse, speed added                          |
| `0.3.0` | Performance optimizations, edge case fixes                 |
| `1.0.0` | Battle-tested in production, API is stable                 |

## Dependencies

neiro has two runtime dependencies:

- `@breezystack/lamejs` — MP3 encoding (pure JavaScript)
- `audio-decode` — Multi-format audio decoding

These are listed in `dependencies` (not `devDependencies`) so they're installed automatically when a user runs `bun add neiro`.

They are marked as `external` in the Vite build config, meaning they're **not bundled** into the dist output. Instead, they're resolved from `node_modules` at runtime. This keeps the package small and avoids duplicate bundling issues.

## GitHub Release (Optional)

After publishing to npm, create a GitHub release:

```bash
# Tag should already exist from npm version
git push origin main --tags

# Create release on GitHub
gh release create v0.1.0 --title "v0.1.0" --notes "Initial release"
```

## Troubleshooting

### "You do not have permission to publish"

You're not logged in or don't own the package name:

```bash
npm login
npm whoami
```

### "Package name already exists"

Someone else owns the name on npm. Either:

- Scope it: rename to `@yourname/neiro` in package.json
- Pick a different name

### "Missing dist/ files"

The build didn't run. `prepublishOnly` script should handle this automatically, but you can also run manually:

```bash
bun run build
ls dist/
```

### Types not working for consumers

Check that `dist/index.d.ts` exists and that `types` in package.json points to it:

```bash
cat dist/index.d.ts | head -20
```

If it's empty or missing, check the `vite-plugin-dts` configuration in `vite.config.ts`.
