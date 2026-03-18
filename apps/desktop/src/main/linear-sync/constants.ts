/**
 * Constants for the Linear bidirectional sync engine.
 */

// Re-export from shared for convenience within the sync engine
export { APERANT_COMMENT_PREFIX } from '../../shared/constants/linear';

/** Default polling interval in milliseconds (60 seconds) */
export const DEFAULT_POLL_INTERVAL_MS = 60_000;

/** Maximum retry attempts before moving to dead letter */
export const MAX_RETRIES = 10;

/** Pause outbound flush when Linear rate limit remaining is below this */
export const RATE_LIMIT_THRESHOLD = 100;

/** If lastSyncAt is older than this many hours, do a full re-sync */
export const STALE_SYNC_HOURS = 24;

/** Maximum issues to fetch per poll cycle */
export const MAX_ISSUES_PER_POLL = 250;

/** Retry backoff base in milliseconds (exponential: base * 2^retry) */
export const RETRY_BACKOFF_BASE_MS = 1_000;

/** Maximum backoff cap in milliseconds (5 minutes) */
export const RETRY_BACKOFF_MAX_MS = 300_000;

/** Outbound queue flush interval in milliseconds (10 seconds) */
export const QUEUE_FLUSH_INTERVAL_MS = 10_000;

/** Directory name for Linear sync data within .auto-claude */
export const LINEAR_SYNC_DIR = 'linear';

/** Sync state filename */
export const SYNC_STATE_FILE = 'sync_state.json';

/** Outbound queue filename */
export const OUTBOUND_QUEUE_FILE = 'outbound_queue.json';

/** Milestone event types (used for 'milestones' verbosity filter) */
export const MILESTONE_EVENT_TYPES = new Set([
  'status_change',
  'qa_result',
  'pr_created',
]);
