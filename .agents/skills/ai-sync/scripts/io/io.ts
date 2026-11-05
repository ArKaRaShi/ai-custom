import { type CommandRunner, commandRunner } from "@/scripts/io/command-runner";
import { createEnvironment, type Environment } from "@/scripts/io/environment";
import { type FileSystem, fileSystem } from "@/scripts/io/file-system";
import { type GitGateway, git } from "@/scripts/io/git/git";
import { type GlobMatcher, globMatcher } from "@/scripts/io/glob-matcher";
import { type Prompter, prompter } from "@/scripts/io/prompter";
import { type Reporter, reporter } from "@/scripts/io/reporter";

/** Every side effect the scripts perform. Built once by the entry point and passed down. */
export interface Io {
  fileSystem: FileSystem;
  environment: Environment;
  globMatcher: GlobMatcher;
  commandRunner: CommandRunner;
  git: GitGateway;
  prompter: Prompter;
  reporter: Reporter;
}

export function createIo(): Io {
  return {
    fileSystem,
    environment: createEnvironment(),
    globMatcher,
    commandRunner,
    git,
    prompter,
    reporter,
  };
}
