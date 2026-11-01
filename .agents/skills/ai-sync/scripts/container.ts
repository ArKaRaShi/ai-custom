import type { CommandRunner } from "@/scripts/application/interfaces/command-runner";
import type { Environment } from "@/scripts/application/interfaces/environment";
import type { FileSystem } from "@/scripts/application/interfaces/file-system";
import type { GitGateway } from "@/scripts/application/interfaces/git-gateway";
import type { GlobMatcher } from "@/scripts/application/interfaces/glob-matcher";
import type { Prompter } from "@/scripts/application/interfaces/prompter";
import type { Reporter } from "@/scripts/application/interfaces/reporter";
import { ManifestRepository } from "@/scripts/application/services/manifest-repository";
import { PlanBuilder } from "@/scripts/application/services/plan-builder";
import { PlanExecutor } from "@/scripts/application/services/plan-executor";
import { PlanStore } from "@/scripts/application/services/plan-store";
import { PlanVerifier } from "@/scripts/application/services/plan-verifier";
import { RootScanner } from "@/scripts/application/services/root-scanner";
import { TargetMatcher } from "@/scripts/application/services/target-matcher";
import { AddRoot } from "@/scripts/application/use-cases/add-root";
import { ApplySavedPlan } from "@/scripts/application/use-cases/apply-saved-plan";
import { BindRoot } from "@/scripts/application/use-cases/bind-root";
import { BootstrapInstalls } from "@/scripts/application/use-cases/bootstrap-installs";
import { CompareTrees } from "@/scripts/application/use-cases/compare-trees";
import { DiscoverCandidates } from "@/scripts/application/use-cases/discover-candidates";
import { InitRepository } from "@/scripts/application/use-cases/init-repository";
import { InspectItems } from "@/scripts/application/use-cases/inspect-items";
import { MigrateV2 } from "@/scripts/application/use-cases/migrate-v2";
import { PruneBackup } from "@/scripts/application/use-cases/prune-backup";
import { ReportStatus } from "@/scripts/application/use-cases/report-status";
import { ResolveConflicts } from "@/scripts/application/use-cases/resolve-conflicts";
import { TrackPath } from "@/scripts/application/use-cases/track-path";
import { TrackSkill } from "@/scripts/application/use-cases/track-skill";
import { TransferChanges } from "@/scripts/application/use-cases/transfer-changes";
import { UntrackEntry } from "@/scripts/application/use-cases/untrack-entry";
import { ViewDiff } from "@/scripts/application/use-cases/view-diff";
import { BunGlobMatcher } from "@/scripts/infrastructure/bun-glob-matcher";
import { ConsoleReporter } from "@/scripts/infrastructure/console-reporter";
import { NodeGitGateway } from "@/scripts/infrastructure/git/node-git-gateway";
import { NodeCommandRunner } from "@/scripts/infrastructure/node-command-runner";
import { NodeEnvironment } from "@/scripts/infrastructure/node-environment";
import { NodeFileSystem } from "@/scripts/infrastructure/node-file-system";
import { ReadlinePrompter } from "@/scripts/infrastructure/readline-prompter";
import { renderTransfer } from "@/scripts/presentation/render/transfer";

/** The adapters behind every port; tests replace any of them. */
export interface Infra {
  fileSystem: FileSystem;
  environment: Environment;
  globMatcher: GlobMatcher;
  commandRunner: CommandRunner;
  gitGateway: GitGateway;
  prompter: Prompter;
  reporter: Reporter;
}

export interface AppServices {
  manifestRepository: ManifestRepository;
  targetMatcher: TargetMatcher;
  planStore: PlanStore;
  rootScanner: RootScanner;
  planBuilder: PlanBuilder;
  planVerifier: PlanVerifier;
  planExecutor: PlanExecutor;
}

export interface AppUseCases {
  initRepository: InitRepository;
  addRoot: AddRoot;
  bindRoot: BindRoot;
  trackPath: TrackPath;
  trackSkill: TrackSkill;
  untrackEntry: UntrackEntry;
  migrateV2: MigrateV2;
  discoverCandidates: DiscoverCandidates;
  bootstrapInstalls: BootstrapInstalls;
  inspectItems: InspectItems;
  reportStatus: ReportStatus;
  compareTrees: CompareTrees;
  viewDiff: ViewDiff;
  resolveConflicts: ResolveConflicts;
  transferChanges: TransferChanges;
  pruneBackup: PruneBackup;
  applySavedPlan: ApplySavedPlan;
}

export interface App extends Infra {
  services: AppServices;
  useCases: AppUseCases;
}

/** Wires adapters, services, and use cases; `overrides` swap individual adapters. */
export function createApp(overrides: Partial<Infra> = {}): App {
  const infra: Infra = {
    fileSystem: new NodeFileSystem(),
    environment: new NodeEnvironment(),
    globMatcher: new BunGlobMatcher(),
    commandRunner: new NodeCommandRunner(),
    gitGateway: new NodeGitGateway(),
    prompter: new ReadlinePrompter(),
    reporter: new ConsoleReporter(),
    ...overrides,
  };
  const { fileSystem, environment, globMatcher, commandRunner, gitGateway, prompter, reporter } =
    infra;

  const manifestRepository = new ManifestRepository({ fileSystem, environment, globMatcher });
  const targetMatcher = new TargetMatcher(globMatcher);
  const planStore = new PlanStore({ fileSystem });
  const rootScanner = new RootScanner({
    fileSystem,
    gitGateway,
    targetMatcher,
    manifestRepository,
  });
  const planBuilder = new PlanBuilder({
    fileSystem,
    gitGateway,
    planStore,
    rootScanner,
    targetMatcher,
  });
  const planVerifier = new PlanVerifier({ fileSystem, planBuilder, rootScanner });
  const planExecutor = new PlanExecutor({
    fileSystem,
    manifestRepository,
    planBuilder,
    targetMatcher,
  });

  const trackPath = new TrackPath({ manifestRepository });
  const transferChanges = new TransferChanges({
    fileSystem,
    gitGateway,
    planBuilder,
    planExecutor,
    reporter,
    rootScanner,
  });

  const useCases: AppUseCases = {
    initRepository: new InitRepository({ manifestRepository, fileSystem }),
    addRoot: new AddRoot({ manifestRepository }),
    bindRoot: new BindRoot({ manifestRepository, environment }),
    trackPath,
    trackSkill: new TrackSkill({ manifestRepository, fileSystem }),
    untrackEntry: new UntrackEntry({ manifestRepository, trackPath }),
    migrateV2: new MigrateV2({ manifestRepository, fileSystem, environment }),
    discoverCandidates: new DiscoverCandidates({
      manifestRepository,
      fileSystem,
      targetMatcher,
      reporter,
    }),
    bootstrapInstalls: new BootstrapInstalls({
      manifestRepository,
      fileSystem,
      commandRunner,
      reporter,
      pullPreview: (repoBase: string): void =>
        renderTransfer(
          transferChanges.execute({ operation: "pull", repoBase, opts: {} }),
          undefined,
        ),
    }),
    inspectItems: new InspectItems({ manifestRepository, targetMatcher }),
    reportStatus: new ReportStatus({ rootScanner, targetMatcher, environment }),
    compareTrees: new CompareTrees({ rootScanner, targetMatcher }),
    viewDiff: new ViewDiff({ rootScanner, targetMatcher, commandRunner, reporter }),
    resolveConflicts: new ResolveConflicts({
      rootScanner,
      targetMatcher,
      fileSystem,
      commandRunner,
      prompter,
      reporter,
      environment,
    }),
    transferChanges,
    pruneBackup: new PruneBackup({ planBuilder, planExecutor }),
    applySavedPlan: new ApplySavedPlan({ gitGateway, planExecutor, planStore, planVerifier }),
  };

  return {
    ...infra,
    services: {
      manifestRepository,
      targetMatcher,
      planStore,
      rootScanner,
      planBuilder,
      planVerifier,
      planExecutor,
    },
    useCases,
  };
}
