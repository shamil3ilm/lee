/**
 * v17 §9.1 — the one fixed identity the local E2E test sign-in can create a
 * session for. Imported only by the dev-only provider module, the sign-in
 * button and the E2E seed script; never by code on the production path.
 */
export const TEST_LOGIN_PROVIDER_ID = 'e2e-test-login'
export const TEST_LOGIN_EMAIL = 'e2e@employ.test'
export const TEST_LOGIN_NAME = 'E2E Test User'
