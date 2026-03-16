import { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Send,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Separator } from '../ui/separator';
import type { ProjectEnvConfig } from '../../../shared/types';

interface SlackIntegrationSectionProps {
  envConfig: ProjectEnvConfig;
  updateEnvConfig: (updates: Partial<ProjectEnvConfig>) => void;
}

export function SlackIntegrationSection({ envConfig, updateEnvConfig }: SlackIntegrationSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [showBotToken, setShowBotToken] = useState(false);
  const [showAppToken, setShowAppToken] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ connected: boolean; teamName?: string; channelName?: string; error?: string } | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Check connection when tokens/channel change
  const checkConnection = useCallback(async () => {
    if (!envConfig.slackBotToken || !envConfig.slackChannelId) {
      setConnectionStatus(null);
      return;
    }
    setIsChecking(true);
    try {
      const result = await window.electronAPI.checkSlackConnection(
        envConfig.slackBotToken,
        envConfig.slackChannelId
      );
      if (result.success && result.data) {
        setConnectionStatus({ connected: true, ...result.data });
      } else {
        setConnectionStatus({ connected: false, error: result.error });
      }
    } catch {
      setConnectionStatus({ connected: false, error: 'Connection check failed' });
    } finally {
      setIsChecking(false);
    }
  }, [envConfig.slackBotToken, envConfig.slackChannelId]);

  useEffect(() => {
    if (expanded && envConfig.slackEnabled && envConfig.slackBotToken && envConfig.slackChannelId) {
      checkConnection();
    }
  }, [expanded, envConfig.slackEnabled, checkConnection]);

  const handleSendTest = async () => {
    if (!envConfig.slackBotToken || !envConfig.slackChannelId) return;
    setIsSendingTest(true);
    setTestResult(null);
    try {
      const result = await window.electronAPI.sendSlackTestMessage(
        envConfig.slackBotToken,
        envConfig.slackChannelId
      );
      setTestResult({
        success: result.success,
        message: result.success ? 'Test message sent!' : (result.error || 'Failed'),
      });
    } catch {
      setTestResult({ success: false, message: 'Failed to send test message' });
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <section className="space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-sm font-semibold text-foreground hover:text-foreground/80"
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Slack Integration
          {envConfig.slackEnabled && (
            <span className="px-2 py-0.5 text-xs bg-success/10 text-success rounded-full">
              Enabled
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="space-y-4 pl-6 pt-2">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="font-normal text-foreground">Enable Slack Notifications</Label>
              <p className="text-xs text-muted-foreground">
                Post agent status updates and questions to a Slack channel
              </p>
            </div>
            <Switch
              checked={envConfig.slackEnabled}
              onCheckedChange={(checked) => updateEnvConfig({ slackEnabled: checked })}
            />
          </div>

          {envConfig.slackEnabled && (
            <>
              {/* Bot Token */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">Bot Token</Label>
                <p className="text-xs text-muted-foreground">
                  Bot User OAuth Token from your Slack App settings (starts with <code className="px-1 bg-muted rounded">xoxb-</code>)
                </p>
                <div className="relative">
                  <Input
                    type={showBotToken ? 'text' : 'password'}
                    placeholder="xoxb-..."
                    value={envConfig.slackBotToken || ''}
                    onChange={(e) => updateEnvConfig({ slackBotToken: e.target.value })}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowBotToken(!showBotToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showBotToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* App Token */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">App-Level Token</Label>
                <p className="text-xs text-muted-foreground">
                  Token with <code className="px-1 bg-muted rounded">connections:write</code> scope for Socket Mode (starts with <code className="px-1 bg-muted rounded">xapp-</code>)
                </p>
                <div className="relative">
                  <Input
                    type={showAppToken ? 'text' : 'password'}
                    placeholder="xapp-..."
                    value={envConfig.slackAppToken || ''}
                    onChange={(e) => updateEnvConfig({ slackAppToken: e.target.value })}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAppToken(!showAppToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showAppToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Channel ID */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">Channel ID</Label>
                <p className="text-xs text-muted-foreground">
                  Right-click a channel in Slack → "View channel details" → copy the Channel ID at the bottom
                </p>
                <Input
                  placeholder="C0123456789"
                  value={envConfig.slackChannelId || ''}
                  onChange={(e) => updateEnvConfig({ slackChannelId: e.target.value })}
                />
              </div>

              {/* Connection Status */}
              {envConfig.slackBotToken && envConfig.slackChannelId && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Connection Status</p>
                      <p className="text-xs text-muted-foreground">
                        {isChecking ? 'Checking...' :
                          connectionStatus?.connected
                            ? `Connected to ${connectionStatus.teamName} #${connectionStatus.channelName}`
                            : connectionStatus?.error || 'Not connected'}
                      </p>
                    </div>
                    {isChecking ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : connectionStatus?.connected ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : connectionStatus ? (
                      <AlertCircle className="h-4 w-4 text-warning" />
                    ) : null}
                  </div>
                </div>
              )}

              {/* Send Test Message */}
              {connectionStatus?.connected && (
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSendTest}
                    disabled={isSendingTest}
                  >
                    {isSendingTest ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Send Test Message
                  </Button>
                  {testResult && (
                    <span className={`text-xs ${testResult.success ? 'text-success' : 'text-destructive'}`}>
                      {testResult.message}
                    </span>
                  )}
                </div>
              )}

              <Separator />

              {/* Notification toggles */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-foreground">Notification Settings</Label>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="font-normal text-foreground text-sm">Notify on agent start</Label>
                  </div>
                  <Switch
                    checked={envConfig.slackNotifyOnStart ?? true}
                    onCheckedChange={(checked) => updateEnvConfig({ slackNotifyOnStart: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="font-normal text-foreground text-sm">Notify on completion</Label>
                  </div>
                  <Switch
                    checked={envConfig.slackNotifyOnComplete ?? true}
                    onCheckedChange={(checked) => updateEnvConfig({ slackNotifyOnComplete: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="font-normal text-foreground text-sm">Notify on failure</Label>
                  </div>
                  <Switch
                    checked={envConfig.slackNotifyOnFailure ?? true}
                    onCheckedChange={(checked) => updateEnvConfig({ slackNotifyOnFailure: checked })}
                  />
                </div>
              </div>

              <Separator />

              {/* Agent questions toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="font-normal text-foreground">Allow Agent Questions</Label>
                  <p className="text-xs text-muted-foreground">
                    Agents can ask questions via Slack thread and wait for human replies
                  </p>
                </div>
                <Switch
                  checked={envConfig.slackAskEnabled ?? true}
                  onCheckedChange={(checked) => updateEnvConfig({ slackAskEnabled: checked })}
                />
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
