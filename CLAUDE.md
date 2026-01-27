# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
pnpm install

# Start development server (runs on localhost:8787)
pnpm dev
# or
pnpm start

# Deploy to Cloudflare
pnpm deploy

# Run tests
pnpm test

# Regenerate type definitions from wrangler.jsonc bindings
pnpm cf-typegen
```

## Architecture

This is a Cloudflare Workers project using TypeScript.

- **`src/index.ts`** - Worker entry point. Exports a handler with `fetch` method.
- **`test/`** - Vitest tests using `@cloudflare/vitest-pool-workers`. Tests can run as unit tests (using `createExecutionContext`) or integration tests (using `SELF.fetch`).
- **`wrangler.jsonc`** - Worker configuration. Add bindings here; run `pnpm cf-typegen` to regenerate `Env` types.
- **`worker-configuration.d.ts`** - Auto-generated types for bindings (do not edit manually).

## Type Safety

After modifying `wrangler.jsonc` bindings, run `pnpm cf-typegen` to update the `Env` type definition. The worker handler in `src/index.ts` should satisfy `ExportedHandler<Env>`.
