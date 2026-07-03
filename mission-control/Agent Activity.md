---
cssclasses:
  - mc-dash
---
```dataviewjs
const base = app.vault.adapter.basePath;
let mc; try { mc = require(base + "/.dashboard/mc.js"); } catch (e) { mc = require(base + "/mission-control/.dashboard/mc.js"); }
await mc.render(dv, this, "activity");
```
