# Dependency security maintenance

The 2026-10-06 dependency fix retains both full and production-only npm audits in CI. No vulnerability is ignored and no severity threshold is relaxed.

| Dependency | Override | Scope |
| --- | --- | --- |
| source-map-js | 1.2.2 | Web and Finance OCR |
| postcss-selector-parser | 7.1.6 | Web |
| KaTeX | 0.18.2 | Web, through Mermaid |
| @fastify/busboy | 3.2.2 | Finance OCR multipart processing |
| braces | Private guarded 3.0.3 source | Web build and lint dependencies |

The private braces package is tracked under `vendor/braces`, retaining its upstream MIT license. It bounds parser and AST walker nesting to address GHSA-vfj7-8cjw-p6xm, for which upstream has no patched release. The root development dependency and `$braces` override ensure transitive consumers use the same installed package. `npm ci` installs it without a postinstall patch or network fetch of unreviewed source. See [patch details](../vendor/braces/README.md).

`tests/braces-security.test.ts` verifies transitive consumer resolution, ordinary brace syntax, deeply nested patterns below the existing input-length limit, and deep/cyclic caller-supplied ASTs. Replace the private package with an upstream patched release when available, retaining these regression checks.

The other overrides pin patched releases without changing Next.js or Tailwind major versions. Validate full and production audits, types, tests and builds for both applications after changing overrides. Web lint and browser checks also verify compatibility with the selector parser and build glob dependencies.

Validation on 2026-10-06: clean Web `npm ci`, full and production-only audits for both applications (zero findings), Web lint and type checks, 743 Web tests including five brace security cases, 30 Inventory browser cases, and both production builds passed. Finance OCR passed 387 tests with 171 optional parity cases skipped. The merged Finance notification type definitions were restored separately to resolve the branch's type-check failure.
