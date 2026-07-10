/**
 * `server-only` throws when resolved outside a React Server Component build, to
 * stop server secrets leaking into a client bundle. Test runners have no
 * bundler, so tsconfig.test.json aliases the package here: a deliberate no-op.
 */
export {};
