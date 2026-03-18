/**
 * Linear GraphQL API client for the sync engine.
 * Extracted and extended from ipc-handlers/linear/utils.ts.
 */

import type { LinearIssue, LinearComment } from '../../shared/types/integrations';
import { MAX_ISSUES_PER_POLL } from './constants';

const LINEAR_API_URL = 'https://api.linear.app/graphql';

interface FetchIssuesResult {
  issues: LinearIssue[];
  rateLimitRemaining: number | null;
}

interface MutationResult {
  success: boolean;
  issue?: { id: string; identifier: string; url: string };
  error?: string;
}

export class LinearGraphQLClient {
  private apiKey: string;
  public lastRateLimitRemaining: number | null = null;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async query(queryStr: string, variables?: Record<string, unknown>): Promise<{ data: any; rateLimitRemaining: number | null }> {
    const response = await fetch(LINEAR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.apiKey,
      },
      body: JSON.stringify({ query: queryStr, variables }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error');
      throw new Error(`Linear API error ${response.status}: ${text}`);
    }

    const json = await response.json();
    if (json.errors?.length) {
      throw new Error(`Linear GraphQL error: ${json.errors[0].message}`);
    }

    const remaining = response.headers.get?.('x-ratelimit-requests-remaining')
      ?? (response.headers as any).get?.('x-ratelimit-requests-remaining');
    const rateLimitRemaining = remaining ? parseInt(remaining, 10) : null;
    this.lastRateLimitRemaining = rateLimitRemaining;

    return { data: json.data, rateLimitRemaining };
  }

  async fetchUpdatedIssues(teamId: string, updatedAfter: string, projectId?: string): Promise<FetchIssuesResult> {
    const filter: Record<string, unknown> = {
      team: { id: { eq: teamId } },
      updatedAt: { gt: updatedAfter },
    };
    if (projectId) {
      filter.project = { id: { eq: projectId } };
    }

    const { data, rateLimitRemaining } = await this.query(
      `query($filter: IssueFilter, $first: Int) {
        issues(filter: $filter, first: $first, orderBy: updatedAt) {
          nodes {
            id identifier title description
            state { id name type }
            priority priorityLabel
            labels { nodes { id name color } }
            assignee { id name email }
            project { id name }
            createdAt updatedAt url
          }
        }
      }`,
      { filter, first: MAX_ISSUES_PER_POLL },
    );

    const issues: LinearIssue[] = (data.issues?.nodes ?? []).map((node: any) => ({
      ...node,
      labels: node.labels?.nodes ?? [],
    }));

    return { issues, rateLimitRemaining };
  }

  async fetchIssueComments(issueId: string): Promise<LinearComment[]> {
    const { data } = await this.query(
      `query($issueId: String!) {
        issue(id: $issueId) {
          comments(orderBy: createdAt) {
            nodes { id body user { id name email } createdAt updatedAt }
          }
        }
      }`,
      { issueId },
    );

    return (data.issue?.comments?.nodes ?? []).map((c: any) => ({
      id: c.id,
      body: c.body,
      author: c.user ?? { id: 'unknown', name: 'Unknown' },
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async postComment(issueId: string, body: string): Promise<MutationResult> {
    const { data } = await this.query(
      `mutation($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) {
          success
          comment { id }
        }
      }`,
      { issueId, body },
    );

    return { success: data.commentCreate?.success ?? false };
  }

  async createIssue(teamId: string, title: string, description?: string, projectId?: string): Promise<MutationResult> {
    const input: Record<string, unknown> = { teamId, title };
    if (description) input.description = description;
    if (projectId) input.projectId = projectId;

    const { data } = await this.query(
      `mutation($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { id identifier url }
        }
      }`,
      { input },
    );

    return {
      success: data.issueCreate?.success ?? false,
      issue: data.issueCreate?.issue,
    };
  }

  async updateIssueState(issueId: string, teamId: string, targetStateType: string): Promise<MutationResult> {
    const { data: teamData } = await this.query(
      `query($teamId: String!) {
        team(id: $teamId) {
          states { nodes { id name type } }
        }
      }`,
      { teamId },
    );

    const states = teamData.team?.states?.nodes ?? [];
    const targetState = states.find((s: any) => s.type === targetStateType);
    if (!targetState) {
      return { success: false, error: `No workflow state of type '${targetStateType}' found for team` };
    }

    const { data } = await this.query(
      `mutation($issueId: String!, $stateId: String!) {
        issueUpdate(id: $issueId, input: { stateId: $stateId }) { success }
      }`,
      { issueId, stateId: targetState.id },
    );

    return { success: data.issueUpdate?.success ?? false };
  }

  async fetchIssueById(issueId: string): Promise<LinearIssue | null> {
    try {
      const { data } = await this.query(
        `query($issueId: String!) {
          issue(id: $issueId) {
            id identifier title description
            state { id name type }
            priority priorityLabel
            labels { nodes { id name color } }
            assignee { id name email }
            project { id name }
            createdAt updatedAt url
          }
        }`,
        { issueId },
      );
      if (!data.issue) return null;
      return { ...data.issue, labels: data.issue.labels?.nodes ?? [] };
    } catch {
      return null;
    }
  }
}
