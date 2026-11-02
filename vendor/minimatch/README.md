# Minimatch compatibility adapter

The root `minimatch` override routes lint dependencies through this private
adapter to the unmodified, pinned upstream `minimatch` 11.0.1 release. That
release fixes [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).

ESLint 8 and its plugins expect `require('minimatch')` to return a callable
function. The adapter exposes upstream's function and named exports. Its
`Minimatch` subclass adds the segment metadata and `Symbol.match` interface
needed by ESLint's transitive `glob` 7 dependency, delegating matching to the
upstream segment matcher. No advisory is suppressed. TypeScript ESLint's
modern consumer is overridden directly to upstream 11.0.1.

The `minimatch-engine` npm alias keeps the upstream dependency separate from
the override. Remove the adapter when all lint dependencies support the patched
upstream API directly.
