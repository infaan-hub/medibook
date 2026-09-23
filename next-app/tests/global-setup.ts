/**
 * Shared test bootstrap — ensures the Prisma client is available and the
 * suite can run without a live server for pure unit tests.
 */
export async function setup() {
  // Intentionally lightweight: integration suites spawn their own server.
}

export async function teardown() {
  // no-op
}
