'use strict';

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPaths = [
    path.join(__dirname, '..', '..', '.env'),
    path.join(process.cwd(), '.env')
  ];

  for (const ep of envPaths) {
    if (fs.existsSync(ep)) {
      try {
        const content = fs.readFileSync(ep, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const m = trimmed.match(/^([^#=]+)=(.*)$/);
          if (m) {
            const k = m[1].trim();
            const v = m[2].trim().replace(/^["']|["']$/g, '');
            process.env[k] = v;
          }
        }
      } catch (e) {
        // ignore read errors
      }
    }
  }
}

module.exports = { loadEnv };

