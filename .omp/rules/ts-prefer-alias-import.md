---
description: Prefer path alias imports over parent-relative paths
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
interruptMode: always
---

Prefer configured path aliases (such as `@/...` or `~/...`) over parent-relative
paths (`../`). Sibling imports within the same directory (`./foo`) are allowed.

Follow the project's existing `tsconfig.json` path mappings. If the project
does not configure path aliases or standardizes on relative imports, follow the
project convention.

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
