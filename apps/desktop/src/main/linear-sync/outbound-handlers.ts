/**
 * Format agent pipeline events into markdown comments for Linear.
 * All comments prefixed with [Aperant] for echo prevention.
 */

import { APERANT_COMMENT_PREFIX } from './constants';

const PHASE_LABELS: Record<string, string> = {
  planning: 'Planning',
  coding: 'Coding',
  qa_review: 'QA Review',
  qa_fixing: 'QA Fix',
  spec_creation: 'Spec Creation',
  complete: 'Complete',
  failed: 'Failed',
};

function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase] ?? phase;
}

export function formatAgentProgress(
  identifier: string,
  phase: string,
  message: string,
  currentSubtask?: number,
  totalSubtasks?: number,
): string {
  const progress =
    currentSubtask && totalSubtasks ? ` (${currentSubtask}/${totalSubtasks})` : '';
  return `${APERANT_COMMENT_PREFIX} **${phaseLabel(phase)}**${progress}\n\n${message}`;
}

export function formatQAResult(
  identifier: string,
  passed: boolean,
  issues: string[],
): string {
  if (passed) {
    return `${APERANT_COMMENT_PREFIX} **QA Review** \u2014 passed \u2705\n\nAll acceptance criteria met.`;
  }
  const issueList = issues.map((i) => `- ${i}`).join('\n');
  return `${APERANT_COMMENT_PREFIX} **QA Review** \u2014 failed \u274C\n\n**Issues found:**\n${issueList}`;
}

export function formatPRLink(
  identifier: string,
  prUrl: string,
  branchName: string,
): string {
  return `${APERANT_COMMENT_PREFIX} **Pull Request Created**\n\n\uD83D\uDD17 [${prUrl}](${prUrl})\n\uD83D\uDCCC Branch: \`${branchName}\``;
}

export function formatSpecReady(
  identifier: string,
  summary: string,
  subtasks: string[],
): string {
  const subtaskList = subtasks.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return `${APERANT_COMMENT_PREFIX} **Implementation Plan Ready**\n\n${summary}\n\n**Subtasks:**\n${subtaskList}`;
}

export function formatAgentError(
  identifier: string,
  phase: string,
  errorMessage: string,
): string {
  return `${APERANT_COMMENT_PREFIX} **Error in ${phaseLabel(phase)}**\n\n\`\`\`\n${errorMessage}\n\`\`\``;
}
