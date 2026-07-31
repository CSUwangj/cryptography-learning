# Available Scripts

In the project directory, you can run:

### `npm start` / `npm run dev`

Runs the app in development mode with Vite.<br />
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.
`/query` and `/img` are proxied to `localhost:8000`.

### `npm run typecheck`

Type-checks the TypeScript sources with `tsc --noEmit`.

### `npm test`

Runs the Vitest suite once (jsdom). Use `npm run test:watch` for watch mode.

### `npm run build`

Builds the production bundle into the `dist` folder.

### `npm run gen`

Regenerates GraphQL TypeScript documents from `schema/schema.gql`.

## Build-time environment

Public variables must use the `VITE_` prefix (for example `VITE_FEEDBACK_URL`).
Anything exposed this way is visible in the browser bundle — never put secrets here.

## Toolchain

Use the Node version in `.nvmrc` (exact `engines.node` / bundled npm in
`engines.npm`) and install with `npm ci` so the lockfile is respected.
`engine-strict` rejects other Node/npm versions. `legacy-peer-deps` is required
while the React 16 / Apollo 3.4 graph still has conflicting optional peers;
issue #15/#16 will refresh that graph.
