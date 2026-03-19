import { useTranslation } from 'react-i18next';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { SettingsSection } from './SettingsSection';
import type { AppSettings } from '@shared/types';

interface AutomationSettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}

export function AutomationSettings({ settings, onSettingsChange }: AutomationSettingsProps) {
  const { t } = useTranslation('settings');

  const isEnabled = settings.autoStartLowImpact ?? false;
  const threshold = settings.autoStartImpactThreshold ?? 20;

  return (
    <SettingsSection
      title={t('sections.automation.title')}
      description={t('sections.automation.description')}
    >
      <div className="space-y-4">
        {/* Auto-start toggle */}
        <div className="flex items-center justify-between p-4 rounded-lg border border-border">
          <div className="space-y-1">
            <Label className="font-medium text-foreground">
              {t('automation.autoStartLowImpact')}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t('automation.autoStartLowImpactDescription')}
            </p>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={(checked) =>
              onSettingsChange({ ...settings, autoStartLowImpact: checked })
            }
          />
        </div>

        {/* Threshold slider — only visible when toggle is on */}
        {isEnabled && (
          <div className="space-y-3 p-4 rounded-lg border border-border">
            <div className="space-y-1">
              <Label className="text-sm font-medium text-foreground">
                {t('automation.impactThreshold')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('automation.impactThresholdDescription')}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground w-4">0</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={threshold}
                onChange={(e) =>
                  onSettingsChange({
                    ...settings,
                    autoStartImpactThreshold: parseInt(e.target.value, 10),
                  })
                }
                className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary"
              />
              <span className="text-xs text-muted-foreground w-6">100</span>
              <span className="text-sm font-mono text-foreground w-8 text-right">
                {threshold}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('automation.linearOnly')}
            </p>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
