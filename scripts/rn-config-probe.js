#!/usr/bin/env node

const {loadConfigAsync} = require('@react-native-community/cli-config');

const platform = process.argv[2];
const allowedPlatforms = new Set(['android', 'ios', 'full']);

if (!allowedPlatforms.has(platform)) {
  console.error('Usage: node scripts/rn-config-probe.js <android|ios|full>');
  process.exit(2);
}

async function main() {
  const selectedPlatform = platform === 'full' ? undefined : platform;
  const config = await loadConfigAsync({
    projectRoot: process.cwd(),
    selectedPlatform,
  });

  console.error(`ok: loaded react-native config (${platform})`);
  console.error(`ok: react-native ${config.reactNativeVersion} at ${config.reactNativePath}`);

  const dependencyNames = Object.keys(config.dependencies || {});
  console.error(`ok: ${dependencyNames.length} dependencies discovered`);

  for (const name of dependencyNames) {
    console.error(`checking: ${name}`);
    const dependency = config.dependencies[name];
    if (platform === 'full') {
      Object.keys(dependency.platforms || {}).forEach(key => {
        void dependency.platforms[key];
      });
    } else {
      void dependency.platforms?.[platform];
    }
  }

  if (platform !== 'full') {
    void config.project?.[platform];
  } else {
    void config.project?.android;
    void config.project?.ios;
  }

  console.error(`ok: react-native config probe finished (${platform})`);
}

main().catch(error => {
  console.error('error: react-native config probe failed');
  console.error(error?.stack || String(error));
  process.exit(1);
});
