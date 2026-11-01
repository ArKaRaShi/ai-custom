import type {
  GitPullResult,
  GitPushResult,
  GitPushScope,
  GitRemoteStatus,
  LocalGitState,
  PreviewOptions,
  RemoteIntegrationPreview,
  RevalidationResult,
} from "@/scripts/domain/git";
import type { GitPlan } from "@/scripts/domain/plan";

export interface GitGateway {
  /** HEAD commit of `repo`, or null when it is not a Git repository or has no commits. */
  headCommit(repo: string): string | null;
  /** Subset of repo-relative `relPaths` ignored by the repository's own gitignore rules. */
  ignoredPaths(repo: string, relPaths: string[]): Set<string>;
  /** Path of `repo` inside its Git working tree (`--show-prefix`, e.g. `sub/`), or null when not a Git tree. */
  repoPrefix(repo: string): string | null;
  /** Read-only simulation of integrating the remote; never writes to `repo`. */
  previewRemoteIntegration(repo: string, options?: PreviewOptions): RemoteIntegrationPreview;
  /** HEAD plus index/worktree cleanliness; throws when `repo` is not a Git repository. */
  inspectLocalState(repo: string, exportedPaths?: string[]): LocalGitState;
  /** Checks the saved pull plan still matches the remote and local Git state. */
  revalidate(repo: string, saved: GitPlan): RevalidationResult;
  /** Revalidates then integrates exactly the saved remote commit; leaves no merge in progress on failure. */
  pullChecked(repo: string, saved: GitPlan): GitPullResult;
  /** Git-relative export set for absolute `targetLocations` and pending unrelated changes; null when not Git. */
  previewPush(repo: string, targetLocations: string[]): GitPushScope | null;
  /** Stages, commits, and pushes only `exportedPaths`; aborts on unrelated changes. */
  commitAndPush(repo: string, exportedPaths: string[], commitMessage?: string): GitPushResult;
  /** Ahead/behind status of the current branch against its upstream. */
  remoteStatus(repo: string): GitRemoteStatus;
}
