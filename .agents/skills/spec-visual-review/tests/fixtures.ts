import type { ReviewFiles } from "@/scripts/application/interfaces/review-files";
import type {
  ThaiEntry,
  ThaiRecords,
  ThaiStore,
} from "@/scripts/application/interfaces/thai-store";
import type { Translator } from "@/scripts/application/interfaces/translator";

export const SPEC = `# Feature Specification: Sample Sync

## User Scenarios & Testing

### User Story 1 - Preview safely (Priority: P1)

An agent previews changes for the user.

**Why this priority**: Previews protect files.

**Independent test**: Run a preview in a disposable folder.

**Acceptance scenarios**:

1. **AC-01**: Given a shared item, when a transfer is previewed, then the paths are reported without changes.
2. **AC-02**: Given a <local> item & more, when sync runs, then nothing is overwritten.

### Edge Cases

- A path escapes a configured root.

## Requirements

### Functional Requirements

- **FR-001**: Previews MUST NOT mutate local files.
- **FR-002**: The system MUST report a failed remote prerequisite and MUST NOT silently continue.

### Key Entities

- **Managed item**: A file or skill with a root.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All tested previews leave files unchanged.

## Assumptions

- Git history is not erased by deleting a file.
`;

/** A Thai line that passes every automatic check for the sample spec. */
export function goodThai(text: string): string {
  return `ไทย ${text}`;
}

export class InMemoryFiles implements ReviewFiles {
  readonly files = new Map<string, string>();
  writes: string[] = [];

  async readText(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`missing ${path}`);
    return content;
  }

  async readOptionalText(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  async writeText(path: string, content: string): Promise<void> {
    this.writes.push(path);
    this.files.set(path, content);
  }
}

export class InMemoryStore implements ThaiStore {
  records: ThaiRecords = { model: "", entries: {}, overrides: {} };

  async load(): Promise<ThaiRecords> {
    return structuredClone(this.records);
  }

  async save(entries: Record<string, ThaiEntry>, model: string): Promise<void> {
    this.records = { model, entries: structuredClone(entries), overrides: this.records.overrides };
  }
}

export class FakeTranslator implements Translator {
  readonly model = "fake-model";
  calls: string[][] = [];

  constructor(private readonly render: (text: string) => string = goodThai) {}

  async translate(texts: readonly string[]): Promise<string[]> {
    this.calls.push([...texts]);
    return texts.map((text) => this.render(text));
  }
}
