export { AuthModule } from './auth.module.js';
export { AuthGuard, requiresAuth, capabilityGroupsSatisfied } from './auth.guard.js';
export { Public, RequireSuperadmin, RequireCapability, CurrentPrincipal, CurrentAbility, CurrentAuth } from './decorators.js';
export { PermissionsService, assertCan, assertCanLookup, assertCapability, assertSuperadmin, visibleIds } from './permissions.service.js';
export { PassphraseService, generatePassphrase, normalizePassphrase, passphraseLookup } from './passphrase.service.js';
export {
  SessionService,
  SUPERADMIN_PRINCIPAL,
  SUPERADMIN_POLICY,
  SESSION_IDLE_MS,
  SESSION_ABSOLUTE_MS,
  adminPrincipal,
  adminBlockReason,
  sessionIsValid,
} from './session.service.js';
export { WORDLIST } from './wordlist.js';
