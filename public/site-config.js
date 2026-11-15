// Deployment-specific identifiers, kept in one file so the source tree can be
// shared without them. Empty values disable the features that need them.
export const SITE_CONFIG=Object.freeze({
  // GitHub repository that AI reviewers are pointed to ('' hides the link).
  repositoryUrl:'',
  // owner/name of the PRIVATE repository that receives AI snapshots ('' disables).
  snapshotRepo:'',
  // https origin of the production Worker ('' disables origin-dependent jobs).
  publicOrigin:'',
  // Identifies outbound research requests and the OpenRouter app title.
  userAgent:'KitchenApp/1.0',
  // Production D1 database id pinned by the read-only release guard.
  d1DatabaseId:'00000000-0000-0000-0000-000000000000',
  appTitle:'Kitchen'
});
