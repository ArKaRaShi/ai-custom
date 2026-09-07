import * as mysql from "./mysql";
import * as postgres from "./postgres";
import * as sqlite from "./sqlite";

export const REGISTRY = { postgres, mysql, sqlite };
export type EngineName = keyof typeof REGISTRY;
