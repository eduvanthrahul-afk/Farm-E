'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const targets = [path.join(root, 'server.js'), path.join(root, 'src'), path.join(root, 'scripts')];
const files = [];

const collect = (target) => {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isFile() && target.endsWith('.js')) files.push(target);
  else if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      if (entry.isDirectory()) collect(path.join(target, entry.name));
      else if (entry.isFile() && entry.name.endsWith('.js')) files.push(path.join(target, entry.name));
    }
  }
};

targets.forEach(collect);
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}
if (failed) process.exitCode = 1;
else process.stdout.write(`Syntax check passed for ${files.length} JavaScript files.\n`);
