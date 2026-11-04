---
description: Prefer path aliases over parent-relative imports
globs:
  - "**/*.ts"
  - "**/*.tsx"
condition:
  - "from\\s+['\"][.][.]/"
  - "import\\s*\\(\\s*['\"][.][.]/"
scope:
  - "tool:edit(*.ts)"
  - "tool:edit(*.tsx)"
  - "tool:write(*.ts)"
  - "tool:write(*.tsx)"
interruptMode: never
---

Prefer configured path aliases (such as `@/...` or `~/...`) over
parent-relative path imports (`../`). Sibling imports within the same directory
(`./foo`) are allowed.

Use the project's existing `tsconfig.json` path mappings, or follow its
relative-import convention when aliases are not configured or not customary.

```typescript
// Avoid: parent-relative traversal
import { UserService } from "../../services/user";
import { Config } from "../../../config";

// Prefer: configured path alias
import { UserService } from "@/services/user";
import { Config } from "@/config";

// Allowed: sibling imports
import { userSchema } from "./schema";
```
