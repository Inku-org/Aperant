import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';

export function registerSlackHandlers(
  _getMainWindow: () => BrowserWindow | null
): void {
  // SLACK_CHECK_CONNECTION: Verify bot token and channel access
  ipcMain.handle(
    IPC_CHANNELS.SLACK_CHECK_CONNECTION,
    async (_, botToken: string, channelId: string): Promise<IPCResult<{ teamName: string; channelName: string }>> => {
      try {
        const { WebClient } = await import('@slack/web-api');
        const client = new WebClient(botToken);

        // Test auth
        const authResult = await client.auth.test();
        if (!authResult.ok) {
          return { success: false, error: 'Invalid bot token' };
        }

        // Test channel access
        try {
          const channelInfo = await client.conversations.info({ channel: channelId });
          return {
            success: true,
            data: {
              teamName: (authResult.team as string) || 'Unknown',
              channelName: (channelInfo.channel as any)?.name || channelId,
            }
          };
        } catch {
          return { success: false, error: `Cannot access channel ${channelId}. Make sure the bot is invited to the channel.` };
        }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to connect to Slack'
        };
      }
    }
  );

  // SLACK_TEST_MESSAGE: Send a test message
  ipcMain.handle(
    IPC_CHANNELS.SLACK_TEST_MESSAGE,
    async (_, botToken: string, channelId: string): Promise<IPCResult> => {
      try {
        const { WebClient } = await import('@slack/web-api');
        const client = new WebClient(botToken);

        await client.chat.postMessage({
          channel: channelId,
          text: ':white_check_mark: Aperant Slack integration is working!',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: ':white_check_mark: *Aperant Slack Integration Test*\nThis channel will receive agent notifications and questions.',
              },
            },
          ],
        });

        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to send test message'
        };
      }
    }
  );
}
