# Guarded braces dependency

This private package contains the MIT-licensed `braces` 3.0.3 source, with a local fix for [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Upstream has no patched release as of 2026-10-06. The original license is retained in `LICENSE`.

The parser rejects nesting above 128 levels, including parentheses. An iterative depth check protects compile, expand and stringify when callers pass an AST directly, including cyclic ASTs. Ordinary content globs, alternatives and ranges retain the upstream behavior. Tests in `tests/braces-security.test.ts` exercise the installed override, supported syntax and malicious patterns.

The root package overrides every transitive `braces` dependency with this package. Its distinct name and private version identify the local patch, rather than claiming an upstream security release. No audit advisory is suppressed. Remove this override and package when a compatible upstream fix becomes available.
