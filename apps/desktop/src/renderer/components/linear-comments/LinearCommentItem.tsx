import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

interface LinearCommentItemProps {
  comment: {
    id: string;
    body: string;
    authorName: string;
    createdAt: string;
    isAperant: boolean;
  };
}

export function LinearCommentItem({ comment }: LinearCommentItemProps) {
  const { t } = useTranslation(['linear']);
  const date = new Date(comment.createdAt).toLocaleString();

  return (
    <div
      className={cn(
        'rounded-lg p-3 mb-2',
        comment.isAperant
          ? 'bg-accent/20 border border-accent/30'
          : 'bg-muted/50 border border-border',
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">
          {comment.isAperant ? t('linear:sync.aperantBot') : comment.authorName}
        </span>
        <span className="text-xs text-muted-foreground">{date}</span>
      </div>
      <div className="text-sm whitespace-pre-wrap">{comment.body}</div>
    </div>
  );
}
