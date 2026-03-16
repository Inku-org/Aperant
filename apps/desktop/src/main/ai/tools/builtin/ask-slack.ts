/**
 * AskSlack Tool
 * =============
 *
 * Asks a question via Slack thread and waits for a human reply.
 * Used by agents to get clarification from humans during autonomous execution.
 */

import { z } from 'zod/v3';

import { Tool } from '../define';
import { ToolPermission } from '../types';

const inputSchema = z.object({
  question: z.string().describe('The question to ask the human via Slack'),
  context: z.string().optional().describe('Additional context to help the human understand the question'),
  timeout_minutes: z.number().optional().default(30).describe('How long to wait for a reply (default: 30 minutes)'),
});

export const askSlackTool = Tool.define({
  metadata: {
    name: 'AskSlack',
    description:
      'Ask a question via Slack thread and wait for a human reply. Use this when you need clarification, approval, or a decision from a human before proceeding. The question will be posted in the task\'s Slack thread and the tool will wait for a reply.',
    permission: ToolPermission.Auto,
    executionOptions: {
      timeoutMs: 1_800_000, // 30 minutes
      allowBackground: false,
    },
  },
  inputSchema,
  execute: async (input, context) => {
    if (!context.askSlack) {
      return 'Slack is not configured for this project. Proceeding with best judgment.';
    }

    const fullQuestion = input.context
      ? `${input.question}\n\nContext: ${input.context}`
      : input.question;

    try {
      const reply = await context.askSlack(
        fullQuestion,
        (input.timeout_minutes ?? 30) * 60_000,
      );
      return `Human replied via Slack:\n\n${reply}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('timeout')) {
        return 'No reply received within the timeout period. Proceeding with best judgment.';
      }
      return `Slack error: ${message}. Proceeding with best judgment.`;
    }
  },
});
