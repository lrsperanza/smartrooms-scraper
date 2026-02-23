const { spawn } = require('child_process');
const path = require('path');

function runScript(scriptPath) {
  return new Promise((resolve) => {
    console.log(`\n=== Starting ${scriptPath} ===\n`);
    const child = spawn('node', [scriptPath], { stdio: 'inherit' });
    child.on('close', (code) => {
      if (code !== 0) {
        console.error(`\n=== ${scriptPath} exited with code ${code} ===\n`);
      } else {
        console.log(`\n=== ${scriptPath} completed successfully ===\n`);
      }
      resolve(code);
    });
    child.on('error', (err) => {
      console.error(`\n=== Failed to start ${scriptPath}: ${err.message} ===\n`);
      resolve(1);
    });
  });
}

async function main() {
  await runScript(path.join(__dirname, 'smartrooms-scraper.js'));
  await runScript(path.join(__dirname, 'vitaboum-scraper.js'));
}

main();
