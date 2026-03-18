import type { WebSocket } from 'ws';
import type { IpcCompat } from './ipc-compat';

interface InvokeMessage {
  type: 'invoke';
  id: string;
  channel: string;
  args: unknown[];
}

interface SendMessage {
  type: 'send';
  channel: string;
  args: unknown[];
}

type WsMessage = InvokeMessage | SendMessage;

export interface WsDispatcher {
  handleMessage: (ws: WebSocket, raw: string) => Promise<void>;
}

export function createWsDispatcher(compat: IpcCompat): WsDispatcher {
  return {
    async handleMessage(ws: WebSocket, raw: string): Promise<void> {
      let msg: WsMessage;
      try {
        msg = JSON.parse(raw);
      } catch {
        return; // Ignore malformed JSON
      }

      if (msg.type === 'invoke') {
        const { id, channel, args } = msg as InvokeMessage;
        if (!id || !channel) return;
        console.log(`[ws-dispatch] invoke: ${channel}`);
        try {
          const result = await compat.dispatch(channel, args ?? []);
          ws.send(JSON.stringify({ type: 'response', id, data: result }));
        } catch (err) {
          console.error(`[ws-dispatch] invoke error on ${channel}:`, err instanceof Error ? err.message : err);
          ws.send(JSON.stringify({
            type: 'response',
            id,
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      } else if (msg.type === 'send') {
        const { channel, args } = msg as SendMessage;
        if (!channel) return;
        console.log(`[ws-dispatch] send: ${channel}`);
        compat.dispatchFireAndForget(channel, args ?? []);
      }
    },
  };
}
