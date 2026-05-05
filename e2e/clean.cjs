const fs = require('node:fs');
const path = require('node:path');

for (const directory of ['e2e-data', 'e2e-uploads']) {
  const target = path.resolve(process.cwd(), directory);
  if (!target.startsWith(process.cwd())) {
    throw new Error(`Refusing to clean outside workspace: ${target}`);
  }
  fs.rmSync(target, { recursive: true, force: true });
}
