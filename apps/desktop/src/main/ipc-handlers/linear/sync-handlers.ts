/**
 * Linear two-way status sync IPC handlers
 */

import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import path from "path";
import { existsSync, readFileSync, readdirSync } from "fs";
import {
  IPC_CHANNELS,
  getSpecsDir,
  AUTO_BUILD_PATHS,
} from "../../../shared/constants";
import type {
  IPCResult,
  LinearSyncEvent,
  TaskMetadata,
} from "../../../shared/types";
import { projectStore } from "../../project-store";
import { AgentManager } from "../../agent";
import { getLinearApiKey, linearGraphQL } from "./utils";
import { parseEnvFile } from "../utils";
import { LinearSyncEngine } from "../../linear-sync";
import type { SyncEngineConfig, SyncEngineStatus } from "../../linear-sync";
import { mapTaskStatusToLinearStateType } from "../../linear-sync/status-mapping";

// Singleton engine per project
const syncEngines = new Map<string, LinearSyncEngine>();

/** Get the sync engine for a project (used by agent event integration) */
export function getSyncEngine(
  projectId: string,
): LinearSyncEngine | undefined {
  return syncEngines.get(projectId);
}

/**
 * Get the workflow state ID for a given state type from a team's states
 */
async function getWorkflowStateId(
  apiKey: string,
  teamId: string,
  stateType: string,
): Promise<string | null> {
  const query = `
    query($teamId: String!) {
      team(id: $teamId) {
        states {
          nodes {
            id
            name
            type
          }
        }
      }
    }
  `;

  const data = (await linearGraphQL(apiKey, query, { teamId })) as {
    team: {
      states: {
        nodes: Array<{ id: string; name: string; type: string }>;
      };
    };
  };

  // Find the first state matching the desired type
  const matchingState = data.team.states.nodes.find(
    (s) => s.type === stateType,
  );
  return matchingState?.id || null;
}

/**
 * Core sync logic: sync a task's status to its linked Linear issue.
 * Can be called directly (not just via IPC).
 *
 * @param projectId - Aperant project ID
 * @param taskSpecId - Task spec ID (folder name under specs/)
 * @param statusOverride - If provided, use this status instead of reading from plan file
 */
export async function syncTaskStatusToLinear(
  projectId: string,
  taskSpecId: string,
  statusOverride?: string,
): Promise<IPCResult<LinearSyncEvent>> {
  const project = projectStore.getProject(projectId);
  if (!project) {
    return { success: false, error: "Project not found" };
  }

  const apiKey = getLinearApiKey(project);
  if (!apiKey) {
    return { success: false, error: "No Linear API key configured" };
  }

  try {
    // Read task_metadata.json to get Linear issue info
    const specsBaseDir = getSpecsDir(project.autoBuildPath);
    const specsDir = path.join(project.path, specsBaseDir);
    const specDir = path.join(specsDir, taskSpecId);
    const metadataPath = path.join(specDir, "task_metadata.json");

    if (!existsSync(metadataPath)) {
      return { success: false, error: "Task metadata not found" };
    }

    const metadata: TaskMetadata = JSON.parse(
      readFileSync(metadataPath, "utf-8"),
    );

    if (metadata.sourceType !== "linear" || !metadata.linearIssueId) {
      return {
        success: false,
        error: "Task is not linked to a Linear issue",
      };
    }

    // Determine task status: use override or read from plan file
    let taskStatus = statusOverride;
    if (!taskStatus) {
      const planPath = path.join(
        specDir,
        AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN,
      );
      if (!existsSync(planPath)) {
        return { success: false, error: "Implementation plan not found" };
      }
      const plan = JSON.parse(readFileSync(planPath, "utf-8"));
      taskStatus = plan.status as string;
    }

    // Map task status to Linear state type
    const linearStateType = mapTaskStatusToLinearStateType(taskStatus);
    if (!linearStateType) {
      return {
        success: true,
        data: {
          success: false,
          issueId: metadata.linearIssueId,
          issueIdentifier: metadata.linearIdentifier,
          error: `Task status "${taskStatus}" does not map to a Linear state`,
        },
      };
    }

    // Fetch the current issue to get its team and current state
    const issueQuery = `
      query($issueId: String!) {
        issue(id: $issueId) {
          id
          identifier
          state {
            id
            name
            type
          }
          team {
            id
          }
        }
      }
    `;

    const issueData = (await linearGraphQL(apiKey, issueQuery, {
      issueId: metadata.linearIssueId,
    })) as {
      issue: {
        id: string;
        identifier: string;
        state: { id: string; name: string; type: string };
        team: { id: string };
      };
    };

    const currentState = issueData.issue.state;

    // If already in the target state type, no update needed
    if (currentState.type === linearStateType) {
      return {
        success: true,
        data: {
          success: true,
          issueId: metadata.linearIssueId,
          issueIdentifier: issueData.issue.identifier,
          previousState: currentState.name,
          newState: currentState.name,
        },
      };
    }

    // Get the target state ID from the team's workflow states
    const targetStateId = await getWorkflowStateId(
      apiKey,
      issueData.issue.team.id,
      linearStateType,
    );
    if (!targetStateId) {
      return {
        success: true,
        data: {
          success: false,
          issueId: metadata.linearIssueId,
          issueIdentifier: issueData.issue.identifier,
          error: `No workflow state found for type "${linearStateType}" in the team`,
        },
      };
    }

    // Update the issue state
    const updateMutation = `
      mutation($issueId: String!, $stateId: String!) {
        issueUpdate(id: $issueId, input: { stateId: $stateId }) {
          success
          issue {
            id
            state {
              id
              name
              type
            }
          }
        }
      }
    `;

    const updateResult = (await linearGraphQL(apiKey, updateMutation, {
      issueId: metadata.linearIssueId,
      stateId: targetStateId,
    })) as {
      issueUpdate: {
        success: boolean;
        issue: {
          id: string;
          state: { id: string; name: string; type: string };
        };
      };
    };

    if (!updateResult.issueUpdate.success) {
      return {
        success: true,
        data: {
          success: false,
          issueId: metadata.linearIssueId,
          issueIdentifier: issueData.issue.identifier,
          error: "Linear API returned unsuccessful update",
        },
      };
    }

    return {
      success: true,
      data: {
        success: true,
        issueId: metadata.linearIssueId,
        issueIdentifier: issueData.issue.identifier,
        previousState: currentState.name,
        newState: updateResult.issueUpdate.issue.state.name,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to sync issue status",
    };
  }
}

/**
 * Fire-and-forget: sync task status to Linear in the background.
 * Logs warnings on failure but never throws.
 */
export function syncTaskStatusToLinearInBackground(
  projectId: string,
  taskSpecId: string,
  status: string,
): void {
  syncTaskStatusToLinear(projectId, taskSpecId, status).then(
    (result) => {
      if (result.success && result.data?.success) {
        console.warn(
          `[LINEAR_SYNC] ${result.data.issueIdentifier}: ${result.data.previousState} → ${result.data.newState}`,
        );
      } else if (result.success && result.data && !result.data.success) {
        // Not an error — status doesn't map or is already correct
      } else if (!result.success && result.error !== "Task metadata not found" && result.error !== "Task is not linked to a Linear issue" && result.error !== "No Linear API key configured") {
        console.warn(`[LINEAR_SYNC] Failed to sync: ${result.error}`);
      }
    },
    (err) => {
      console.warn("[LINEAR_SYNC] Unexpected error:", err);
    },
  );
}

/**
 * Sync task status to Linear issue (IPC handler)
 */
function registerSyncIssueStatus(
  _agentManager: AgentManager,
  _getMainWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(
    IPC_CHANNELS.LINEAR_SYNC_ISSUE_STATUS,
    async (
      _,
      projectId: string,
      taskId: string,
    ): Promise<IPCResult<LinearSyncEvent>> => {
      return syncTaskStatusToLinear(projectId, taskId);
    },
  );
}

/**
 * Register all sync-related handlers
 */
export function registerLinearSyncHandlers(
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null,
): void {
  registerSyncIssueStatus(agentManager, getMainWindow);
}

/**
 * Helper: read a Linear env variable from the project's .env file.
 */
function getLinearEnvVar(
  project: { path: string; autoBuildPath: string },
  varName: string,
): string | null {
  if (!project.autoBuildPath) return null;
  const envPath = path.join(project.path, project.autoBuildPath, ".env");
  if (!existsSync(envPath)) return null;

  try {
    const content = readFileSync(envPath, "utf-8");
    const vars = parseEnvFile(content);
    return vars[varName] || null;
  } catch {
    return null;
  }
}

/**
 * Register sync engine lifecycle IPC handlers (start/stop/status).
 */
export function registerSyncEngineHandlers(
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null,
): void {
  // Start sync engine for a project
  ipcMain.handle(
    IPC_CHANNELS.LINEAR_START_SYNC,
    async (_, projectId: string): Promise<IPCResult<SyncEngineStatus>> => {
      // Already running?
      if (syncEngines.has(projectId)) {
        const engine = syncEngines.get(projectId)!;
        return { success: true, data: engine.getStatus() };
      }

      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: "Project not found" };
      }

      const apiKey = getLinearApiKey(project);
      if (!apiKey) {
        return { success: false, error: "No Linear API key configured" };
      }

      const teamId = getLinearEnvVar(project, "LINEAR_TEAM_ID");
      if (!teamId) {
        return { success: false, error: "No Linear team ID configured" };
      }

      const linearProjectId =
        getLinearEnvVar(project, "LINEAR_PROJECT_ID") || undefined;

      try {
        const specsBaseDir = getSpecsDir(project.autoBuildPath);
        const specsDir = path.join(project.path, specsBaseDir);

        const config: SyncEngineConfig = {
          projectPath: project.path,
          autoBuildPath: project.autoBuildPath,
          apiKey,
          teamId,
          projectId: linearProjectId,
        };

        const engine = new LinearSyncEngine(config, specsDir);

        // Wire sync engine events to the renderer
        engine.on("sync-cycle-complete", (result: unknown) => {
          getMainWindow()?.webContents.send(
            IPC_CHANNELS.LINEAR_SYNC_ENGINE_EVENT,
            projectId,
            { type: "sync-cycle-complete", result },
          );
        });

        engine.on("sync-error", (message: string) => {
          getMainWindow()?.webContents.send(
            IPC_CHANNELS.LINEAR_SYNC_ENGINE_EVENT,
            projectId,
            { type: "sync-error", message },
          );
        });

        engine.on("flush-error", (message: string) => {
          getMainWindow()?.webContents.send(
            IPC_CHANNELS.LINEAR_SYNC_ENGINE_EVENT,
            projectId,
            { type: "flush-error", message },
          );
        });

        engine.on(
          "issue-canceled",
          (issueIdentifier: string, _issueId: string) => {
            // Find the task spec linked to this issue and kill any running agent
            const specsBaseDir2 = getSpecsDir(project.autoBuildPath);
            const specsDirPath = path.join(project.path, specsBaseDir2);

            if (existsSync(specsDirPath)) {
              try {
                const specDirs = readdirSync(specsDirPath, {
                  withFileTypes: true,
                });
                for (const dirent of specDirs) {
                  if (!dirent.isDirectory()) continue;
                  const metaPath = path.join(
                    specsDirPath,
                    dirent.name,
                    "task_metadata.json",
                  );
                  if (!existsSync(metaPath)) continue;
                  try {
                    const meta: TaskMetadata = JSON.parse(
                      readFileSync(metaPath, "utf-8"),
                    );
                    if (meta.linearIdentifier === issueIdentifier) {
                      agentManager.killTask(dirent.name);
                      break;
                    }
                  } catch {
                    // Skip malformed metadata
                  }
                }
              } catch {
                // Skip read errors
              }
            }

            getMainWindow()?.webContents.send(
              IPC_CHANNELS.LINEAR_SYNC_ENGINE_EVENT,
              projectId,
              { type: "issue-canceled", issueIdentifier },
            );
          },
        );

        engine.on("started", () => {
          getMainWindow()?.webContents.send(
            IPC_CHANNELS.LINEAR_SYNC_ENGINE_EVENT,
            projectId,
            { type: "started" },
          );
        });

        engine.on("stopped", () => {
          getMainWindow()?.webContents.send(
            IPC_CHANNELS.LINEAR_SYNC_ENGINE_EVENT,
            projectId,
            { type: "stopped" },
          );
        });

        syncEngines.set(projectId, engine);
        await engine.start();

        return { success: true, data: engine.getStatus() };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to start sync engine",
        };
      }
    },
  );

  // Stop sync engine for a project
  ipcMain.handle(
    IPC_CHANNELS.LINEAR_STOP_SYNC,
    async (_, projectId: string): Promise<IPCResult<void>> => {
      const engine = syncEngines.get(projectId);
      if (!engine) {
        return { success: true, data: undefined };
      }

      try {
        await engine.stop();
        syncEngines.delete(projectId);
        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to stop sync engine",
        };
      }
    },
  );

  // Get sync engine status
  ipcMain.handle(
    IPC_CHANNELS.LINEAR_GET_SYNC_STATUS,
    async (_, projectId: string): Promise<IPCResult<SyncEngineStatus>> => {
      const engine = syncEngines.get(projectId);
      if (!engine) {
        return {
          success: true,
          data: {
            running: false,
            lastSyncAt: null,
            issueCount: 0,
            pendingOutbound: 0,
            deadLetterCount: 0,
          },
        };
      }
      return { success: true, data: engine.getStatus() };
    },
  );
}
