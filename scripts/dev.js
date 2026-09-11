// Start both development processes without shell-dependent command chaining.
const { spawn } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const children = [];
let closing = false;
function stop(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
function start(file, cwd, env) {
  const child = spawn(process.execPath, [file], { cwd, stdio: 'inherit', env });
  children.push(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => stop(code || 0));
}
const frontend = path.join(root, 'frontend');
// Resolve before launching either child so missing dependencies cannot orphan
// the backend process.
const reactStart = require.resolve('react-scripts/scripts/start', { paths: [frontend] });
start(path.join(root, 'backend/server.js'), path.join(root, 'backend'), { ...process.env, PORT: '5000' });
start(reactStart, frontend, {
  ...process.env, PORT: '3000', BROWSER: 'none', REACT_APP_API_URL: ''
});
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
