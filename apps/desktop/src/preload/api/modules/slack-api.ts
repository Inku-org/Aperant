import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult } from '../../../shared/types';
import { invokeIpc } from './ipc-utils';

/**
 * Slack Integration API operations
 */
export interface SlackAPI {
  checkSlackConnection: (botToken: string, channelId: string) => Promise<IPCResult<{ teamName: string; channelName: string }>>;
  sendSlackTestMessage: (botToken: string, channelId: string) => Promise<IPCResult>;
}

/**
 * Creates the Slack Integration API implementation
 */
export const createSlackAPI = (): SlackAPI => ({
  checkSlackConnection: (botToken: string, channelId: string) =>
    invokeIpc(IPC_CHANNELS.SLACK_CHECK_CONNECTION, botToken, channelId),
  sendSlackTestMessage: (botToken: string, channelId: string) =>
    invokeIpc(IPC_CHANNELS.SLACK_TEST_MESSAGE, botToken, channelId),
});
