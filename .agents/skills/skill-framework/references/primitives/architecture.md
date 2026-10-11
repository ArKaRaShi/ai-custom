# Architecture Contract

Executable skills pick one of two tiers. Apply this contract when you write or change code under `scripts/`. External skills keep upstream files unchanged, with no bulk retrofit.

## Select the Tier

| Tier | Use when | `scripts/` layout |
| --- | --- | --- |
| 0 | All of these hold: one command, one job without plugins, I/O limited to reading input and printing, under about 150 lines | Flat `scripts/*.ts` files |
| 1 | At least one of these holds: two or more commands, a plugin point, I/O such as files, git or network combined with branching logic, or more than about 150 lines | The layered layout in the next section |

Choose the tier before writing code, from the requested features. Features that meet any Tier 1 condition get Tier 1 from the first file, even when the first version is small. Do not add empty layers or interfaces in advance. A Tier 0 script that grows past a Tier 1 condition moves to Tier 1 in the same change.

## Tier 1 Layout

```text
scripts/
  cli.ts                      composition root: parse, wire, run one use case, render
  domain/                     entities, pure rules, errors
  application/
    use-cases/                one class per use case, one public `execute`
    services/                 shared application logic used by two or more use cases
    interfaces/               contracts for I/O or plugins that use cases call
  infrastructure/             file system, git, network, plugin implementations
  presentation/               argument parsing and output rendering
```

## Import Rules

An edge means "the row may import the column". `runtime` and `type-only` name the import kind. A same-layer import is allowed, except between use cases.

| From \ To | domain | interfaces | services | use-cases | infrastructure | presentation |
| --- | --- | --- | --- | --- | --- | --- |
| domain | yes | no | no | no | no | no |
| interfaces | both | yes | no | no | no | no |
| services | both | both | yes | no | no | no |
| use-cases | both | both | both | type-only | no | no |
| infrastructure | both | both | no | no | yes | no |
| presentation | both | no | no | type-only | no | yes |

- `cli.ts` may import every layer in any kind. No other file may import `cli.ts`.
- Infrastructure sees only contracts. It never imports a use case or a service.
- Presentation imports only the types `XInput` and `XOutput` of a use case and receives the instance from `cli.ts`. The type-only edge from use cases to use cases serves composite use cases.
- Import project files with relative paths or `@/scripts/...`. The guard treats every other non-relative specifier, including custom aliases such as `@domain/x`, as a package and reports it.

## Purity

- `domain/`, `application/interfaces/`, `application/services/` and `application/use-cases/` do not import I/O modules in any spelling (`fs`, `node:fs`, `fs/promises`, `child_process`, `os`, `http`, `bun` and bare packages). They may import `path` and `crypto`.
- The same files do not use `process`, `Bun`, `fetch`, `console`, `Date.now`, `new Date`, `Math.random`, `randomUUID` or `randomBytes`. Pass time, randomness and environment in as parameters.
- Presentation may use `console` and `process.argv`. It does not use `fs`, `child_process`, `fetch` or `Bun`.

## Use Cases

1. Each use-case file exports exactly one class, and the class has exactly one public method, `execute(input)`. The constructor and `private` or `#` members are not public.
2. Dependencies arrive through the constructor. `execute` takes plain data and returns plain data. Declare `XInput` and `XOutput` beside the class.
3. A workflow with steps or decisions is its own composite use case. It receives the lower-level use cases through its constructor. Dependencies point downward and never form a cycle.
4. Shared application logic goes in a service: a class with plain methods and no `execute`. Shared pure rules go in `domain/`. An interface declares a boundary and contains no shared behavior.
5. `cli.ts` parses arguments, builds objects, runs one `execute`, and renders the result. It does not sequence use cases or make decisions.

```ts
export class Bootstrap {
  constructor(private readonly deps: { planSync: PlanSync; executePull: ExecutePull }) {}
  async execute(input: BootstrapInput): Promise<BootstrapOutput> {
    const plan = await this.deps.planSync.execute({ repoBase: input.repoBase });
    return this.deps.executePull.execute({ plan, apply: input.apply });
  }
}
```

## Boundary Recipe

Add an interface only when a use case or service calls out to I/O or to replaceable plugins.

1. Declare the contract in `application/interfaces/`, shaped by what the caller needs.
2. Implement it in `infrastructure/`. Inject it through the constructor.
3. For core tests, add an in-memory fake under `tests/`.
4. Where a fake and a real adapter both exist, run one shared contract suite against both.

## Testing Contract

| Scope | Requirement |
| --- | --- |
| Domain and application | Plain inputs or fakes. No temporary directories. |
| Each infrastructure adapter | Tests against the real dependency for the behavior the adapter is responsible for. A git adapter uses a throwaway repository with a local bare remote. |
| File-system and transfer adapters | Also cover symlink escape, atomic rename and rollback, read-only destinations, and cleanup of staging directories. |
| Every Tier 1 skill | One end-to-end run through the real entry point with real infrastructure and a temporary environment. Use a temporary `HOME` when a CLI exists. |

## Enforcement

Run the layer guard from the directory of the skill under check. It exits nonzero on any violation.

```bash
bun ~/.agents/skills/skill-framework/scripts/layer-guard.ts scripts
```

The guard checks the import matrix and kinds, the purity rules, the one-`execute` rule for use cases, and use-case cycles. It is a convention check, not proof of purity. It reads static imports, `export ... from`, and `import()` or `require()` with literal specifiers. It does not detect computed specifiers or indirect access such as `globalThis["process"]`.

## Verification

Prerequisites: Bun 1.4 or later and this framework installed at `~/.agents/skills/skill-framework`. Work from the directory of the skill under check.

1. Run `bun ~/.agents/skills/skill-framework/scripts/layer-guard.ts scripts`. Any violation fails.
2. Run the skill's tests, including the adapter tests against real dependencies and the end-to-end run.
3. Record each result and any rule the guard cannot see.
