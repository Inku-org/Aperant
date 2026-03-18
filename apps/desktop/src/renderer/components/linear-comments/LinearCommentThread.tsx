import { useTranslation } from 'react-i18next';
import { LinearCommentItem } from './LinearCommentItem';

interface LinearCommentThreadProps {
  comments: Array<{
    id: string;
    body: string;
    authorName: string;
    createdAt: string;
    isAperant: boolean;
  }>;
  issueIdentifier: string;
}

export function LinearCommentThread({ comments, issueIdentifier }: LinearCommentThreadProps) {
  const { t } = useTranslation(['linear']);

  if (comments.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        {t('linear:sync.noComments')}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <h4 className="text-sm font-medium mb-2">
        {t('linear:sync.commentsTitle', { identifier: issueIdentifier })}
      </h4>
      {comments.map((comment) => (
        <LinearCommentItem key={comment.id} comment={comment} />
      ))}
    </div>
  );
}
