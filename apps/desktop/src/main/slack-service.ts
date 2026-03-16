/**
 * SlackService — singleton for posting agent lifecycle notifications to Slack.
 *
 * Uses @slack/web-api for posting messages and @slack/socket-mode for
 * receiving thread replies (used by the askQuestion flow).
 *
 * All public methods are safe to call even when disconnected — they log
 * a warning and return gracefully so agent execution is never blocked.
 */

import { WebClient } from '@slack/web-api';
import { SocketModeClient } from '@slack/socket-mode';
import type { KnownBlock } from '@slack/types';

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

export interface SlackAgentStartPayload {
  taskTitle: string;
  taskDescription?: string;
  linearIdentifier?: string;
  linearUrl?: string;
  impactScore?: number;
  riskLevel?: string;
  affectedFiles?: string[];
  blastRadius?: number;
  affectedSymbols?: number;
  complexity?: string;
  projectName?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function impactEmoji(score: number): string {
  if (score >= 80) return ':red_circle:';
  if (score >= 50) return ':large_orange_circle:';
  if (score >= 20) return ':large_yellow_circle:';
  return ':white_circle:';
}

function impactLabel(score: number): string {
  if (score >= 80) return 'Critical';
  if (score >= 50) return 'High';
  if (score >= 20) return 'Medium';
  return 'Low';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class SlackService {
  private webClient: WebClient | null = null;
  private socketClient: SocketModeClient | null = null;
  private channelId = '';
  private currentBotToken = '';
  private currentAppToken = '';

  /** taskId -> Slack thread_ts */
  private threadMap: Map<string, string> = new Map();

  /** questionId -> pending resolver */
  private pendingQuestions: Map<
    string,
    { resolve: (reply: string) => void; reject: (err: Error) => void; timeoutId: NodeJS.Timeout }
  > = new Map();

  private connected = false;

  // -----------------------------------------------------------------------
  // Connection lifecycle
  // -----------------------------------------------------------------------

  async connect(botToken: string, appToken: string, channelId: string): Promise<void> {
    // Skip if already connected with same credentials
    if (
      this.connected &&
      this.currentBotToken === botToken &&
      this.currentAppToken === appToken &&
      this.channelId === channelId
    ) {
      return;
    }

    // Disconnect previous session if credentials changed
    if (this.connected) {
      await this.disconnect();
    }

    try {
      this.webClient = new WebClient(botToken);
      this.socketClient = new SocketModeClient({ appToken });

      // Route thread replies to pending questions
      this.socketClient.on('message', async ({ event, ack }) => {
        try {
          if (ack) await ack();
        } catch {
          // ack failure is non-fatal
        }

        // Ignore bot messages
        if (event.bot_id || event.subtype === 'bot_message') return;

        const threadTs = event.thread_ts as string | undefined;
        if (!threadTs) return;

        // Check if any pending question lives in this thread
        for (const [questionId, pending] of this.pendingQuestions.entries()) {
          // We store the thread_ts as part of the questionId convention:
          // the question was posted in the task's thread, so we match by
          // checking all pending questions whose thread matches.
          // The questionId encodes the threadTs — see askQuestion().
          if (questionId.endsWith(`_${threadTs}`)) {
            clearTimeout(pending.timeoutId);
            this.pendingQuestions.delete(questionId);
            pending.resolve(event.text as string);
            return;
          }
        }
      });

      await this.socketClient.start();

      this.channelId = channelId;
      this.currentBotToken = botToken;
      this.currentAppToken = appToken;
      this.connected = true;

      console.warn('[SlackService] Connected successfully');
    } catch (err) {
      console.warn('[SlackService] Failed to connect:', err);
      this.webClient = null;
      this.socketClient = null;
      this.connected = false;
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.socketClient) {
        await this.socketClient.disconnect();
      }
    } catch (err) {
      console.warn('[SlackService] Error during socket disconnect:', err);
    }

    // Reject all pending questions
    for (const [questionId, pending] of this.pendingQuestions.entries()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('SlackService disconnected'));
      this.pendingQuestions.delete(questionId);
    }

    this.webClient = null;
    this.socketClient = null;
    this.channelId = '';
    this.currentBotToken = '';
    this.currentAppToken = '';
    this.threadMap.clear();
    this.connected = false;

    console.warn('[SlackService] Disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }

  // -----------------------------------------------------------------------
  // Posting messages
  // -----------------------------------------------------------------------

  async postAgentStarted(taskId: string, payload: SlackAgentStartPayload): Promise<string | null> {
    if (!this.webClient || !this.connected) {
      console.warn('[SlackService] Not connected — skipping postAgentStarted');
      return null;
    }

    try {
      const blocks: KnownBlock[] = [];

      // Header
      const titlePrefix = payload.linearIdentifier ? `${payload.linearIdentifier} ` : '';
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:robot_face: *Agent Started: ${titlePrefix}${payload.taskTitle}*`,
        },
      });

      // Context line (impact + blast radius)
      const contextParts: string[] = [];
      if (payload.impactScore !== undefined) {
        contextParts.push(
          `*Impact:* ${impactEmoji(payload.impactScore)} ${payload.impactScore}/100 (${impactLabel(payload.impactScore)})`
        );
      }
      if (payload.blastRadius !== undefined) {
        contextParts.push(`*Blast Radius:* ${payload.blastRadius} files`);
      }
      if (payload.affectedSymbols !== undefined) {
        contextParts.push(`*Affected Symbols:* ${payload.affectedSymbols}`);
      }
      if (payload.riskLevel) {
        contextParts.push(`*Risk:* ${payload.riskLevel}`);
      }
      if (payload.complexity) {
        contextParts.push(`*Complexity:* ${payload.complexity}`);
      }
      if (contextParts.length > 0) {
        blocks.push({
          type: 'context',
          elements: [{ type: 'mrkdwn', text: contextParts.join(' | ') }],
        });
      }

      // Description quote
      if (payload.taskDescription) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `> ${payload.taskDescription.split('\n').join('\n> ')}`,
          },
        });
      }

      // Affected files
      if (payload.affectedFiles && payload.affectedFiles.length > 0) {
        const maxFiles = 10;
        const displayFiles = payload.affectedFiles.slice(0, maxFiles);
        let fileList = displayFiles.map((f) => `\`${f}\``).join('\n');
        if (payload.affectedFiles.length > maxFiles) {
          fileList += `\n...and ${payload.affectedFiles.length - maxFiles} more`;
        }
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: `*Affected Files:*\n${fileList}` },
        });
      }

      // Linear link
      if (payload.linearUrl) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `<${payload.linearUrl}|View in Linear>`,
          },
        });
      }

      // Footer
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: '_Reply in this thread to answer agent questions._' }],
      });

      const result = await this.webClient.chat.postMessage({
        channel: this.channelId,
        blocks,
        text: `Agent Started: ${titlePrefix}${payload.taskTitle}`, // fallback for notifications
      });

      const threadTs = result.ts;
      if (threadTs) {
        this.threadMap.set(taskId, threadTs);
      }

      return threadTs ?? null;
    } catch (err) {
      console.warn('[SlackService] Failed to post agent started message:', err);
      return null;
    }
  }

  async postStatusUpdate(taskId: string, message: string): Promise<void> {
    if (!this.webClient || !this.connected) {
      console.warn('[SlackService] Not connected — skipping postStatusUpdate');
      return;
    }

    const threadTs = this.threadMap.get(taskId);
    if (!threadTs) {
      console.warn(`[SlackService] No thread found for task ${taskId} — skipping status update`);
      return;
    }

    try {
      await this.webClient.chat.postMessage({
        channel: this.channelId,
        thread_ts: threadTs,
        text: message,
      });
    } catch (err) {
      console.warn('[SlackService] Failed to post status update:', err);
    }
  }

  async postCompletion(taskId: string, success: boolean, summary?: string): Promise<void> {
    if (!this.webClient || !this.connected) {
      console.warn('[SlackService] Not connected — skipping postCompletion');
      return;
    }

    const threadTs = this.threadMap.get(taskId);
    if (!threadTs) {
      console.warn(`[SlackService] No thread found for task ${taskId} — skipping completion`);
      return;
    }

    try {
      const emoji = success ? ':white_check_mark:' : ':x:';
      const status = success ? 'Completed' : 'Failed';
      const text = summary
        ? `${emoji} *${status}* — ${summary}`
        : `${emoji} *${status}*`;

      await this.webClient.chat.postMessage({
        channel: this.channelId,
        thread_ts: threadTs,
        text,
      });
    } catch (err) {
      console.warn('[SlackService] Failed to post completion:', err);
    }

    // Clean up thread mapping after completion
    this.threadMap.delete(taskId);
  }

  async askQuestion(
    taskId: string,
    questionId: string,
    question: string,
    timeoutMs = 1_800_000
  ): Promise<string> {
    if (!this.webClient || !this.connected) {
      throw new Error('SlackService not connected');
    }

    const threadTs = this.threadMap.get(taskId);
    if (!threadTs) {
      throw new Error(`No Slack thread found for task ${taskId}`);
    }

    try {
      await this.webClient.chat.postMessage({
        channel: this.channelId,
        thread_ts: threadTs,
        text: `:question: *Agent Question:*\n${question}`,
      });
    } catch (err) {
      throw new Error(`Failed to post question to Slack: ${err}`);
    }

    // Create a promise that resolves when a human replies in the thread
    const compositeId = `${questionId}_${threadTs}`;
    return new Promise<string>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingQuestions.delete(compositeId);
        reject(new Error(`Slack question timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingQuestions.set(compositeId, { resolve, reject, timeoutId });
    });
  }
}

// Export singleton instance
export const slackService = new SlackService();
