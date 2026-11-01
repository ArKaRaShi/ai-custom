export interface RuntimeStatus {
  /** Model repository id and pinned revision that `install` downloads. */
  model: string;
  revision: string;
  /** Folder that holds the downloaded model weights. */
  modelPath: string;
  /** Folder that holds the locked Python environment. */
  environmentPath: string;
  uvInstalled: boolean;
  environmentReady: boolean;
  modelCached: boolean;
}

/** The local machinery behind the translator: a locked Python environment and a model. */
export interface TranslatorRuntime {
  status(): Promise<RuntimeStatus>;
  /** Creates the locked environment and downloads the model. Needs network access. */
  install(): Promise<void>;
}
