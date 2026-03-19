/**
 * Map Aperant task status to Linear workflow state type.
 * Extracted for reuse between sync handlers and agent manager.
 *
 * Linear states: triage | backlog | unstarted | started | completed | canceled
 */
export function mapTaskStatusToLinearStateType(status: string): string | null {
  switch (status) {
    case "backlog":
      return "backlog";
    case "queue":
      return "unstarted";
    case "in_progress":
    case "ai_review":
    case "human_review":
    case "building":
    case "planning":
    case "spec_creation":
      return "started";
    case "done":
    case "pr_created":
    case "merged":
      return "completed";
    case "canceled":
      return "canceled";
    case "error":
      // Don't sync error states
      return null;
    default:
      return null;
  }
}
