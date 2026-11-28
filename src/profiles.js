// Scan profile definitions for `slop-deps init`.
// A profile is the `scan` block persisted into .slopdepsrc.json; scanDirectory
// gates its sentinel passes (code slop, secrets) off these flags. Dependencies
// remain the core module but can be disabled for secrets-only audits.

export const PROFILES = {
  lean: {
    label: 'Lean & Fast',
    description: 'Dependencies only',
    scan: { dependencies: true, codeSlop: false, secrets: false }
  },
  full: {
    label: 'Full Sentinel Suite',
    description: 'Dependencies + Code Slop + Secrets',
    scan: { dependencies: true, codeSlop: true, secrets: true }
  }
};

// choice: '1' | '2' | '3'; custom: module toggles for the custom profile.
export function profileFromChoice(choice, custom = {}) {
  if (choice === '1') {
    return { profile: 'lean', scan: { ...PROFILES.lean.scan } };
  }
  if (choice === '2') {
    return { profile: 'full', scan: { ...PROFILES.full.scan } };
  }
  if (choice === '3') {
    return {
      profile: 'custom',
      scan: {
        dependencies: custom.dependencies !== false,
        codeSlop: custom.codeSlop === true,
        secrets: custom.secrets === true
      }
    };
  }
  return null;
}

// Merge a profile into an existing .slopdepsrc.json object without touching
// user-authored keys (builtins, popular, map, privateScopes, ...).
export function applyProfile(rc, profile) {
  return { ...(rc || {}), profile: profile.profile, scan: { ...profile.scan } };
}
