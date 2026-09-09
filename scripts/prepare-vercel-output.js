const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, '..', 'frontend', 'build');
const destination = path.join(__dirname, '..', 'build');

if (!fs.existsSync(source)) {
  throw new Error(`Frontend build output was not created: ${source}`);
}

fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(source, destination, { recursive: true });
