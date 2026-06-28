const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const repoRoot = path.join(__dirname, '..');
const realCli = path.join(repoRoot, 'node_modules', 'react-native', 'cli.js');

function getFlagValue(flag) {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) {
    return null;
  }
  return args[index + 1];
}

function setFlagValue(flag, value) {
  const index = args.indexOf(flag);
  if (index === -1) {
    args.push(flag, value);
    return;
  }
  args[index + 1] = value;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function delegateToReactNativeCli(cwd = repoRoot) {
  const result = spawnSync(process.execPath, [realCli, ...args], {
    cwd,
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}

function writeMetroConfig(tempRoot, nodeModulesDir) {
  const metroConfigPath = path.join(tempRoot, 'metro.config.js');
  const configSource = `
const path = require('path');
const stagedNodeModules = path.join(__dirname, 'node_modules');
const { getDefaultConfig, mergeConfig } = require(
  require.resolve('@react-native/metro-config', { paths: [${JSON.stringify(nodeModulesDir)}] }),
);
const extraNodeModules = new Proxy(
  {},
  {
    get: (_target, name) => path.join(stagedNodeModules, name),
  },
);

module.exports = mergeConfig(getDefaultConfig(__dirname), {
  projectRoot: __dirname,
  watchFolders: [__dirname],
  resolver: {
    extraNodeModules,
    nodeModulesPaths: [stagedNodeModules],
  },
});
`;
  fs.writeFileSync(metroConfigPath, configSource);
  return metroConfigPath;
}

function writeBabelConfig(tempRoot, nodeModulesDir) {
  const babelConfigPath = path.join(tempRoot, 'babel.config.js');
  const configSource = `
module.exports = {
  presets: [
    require.resolve('@react-native/babel-preset', {
      paths: [${JSON.stringify(nodeModulesDir)}],
    }),
  ],
};
`;
  fs.writeFileSync(babelConfigPath, configSource);
  return babelConfigPath;
}

function prepareTempProjectRoot() {
  const tmpBase = fs.realpathSync(os.tmpdir());
  const tempRoot = path.join(tmpBase, 'mm-rescue-bundle-root');
  fs.rmSync(tempRoot, { recursive: true, force: true });
  ensureDir(tempRoot);

  const itemsToCopy = [
    'App.tsx',
    'app.json',
    'assets',
    'index.js',
    'package.json',
    'react-native.config.js',
    'src',
  ];

  for (const relativePath of itemsToCopy) {
    const sourcePath = path.join(repoRoot, relativePath);
    const targetPath = path.join(tempRoot, relativePath);
    fs.cpSync(sourcePath, targetPath, {
      recursive: true,
      force: true,
    });
  }

  fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(tempRoot, 'node_modules'), 'dir');
  return tempRoot;
}

if (args[0] !== 'bundle') {
  delegateToReactNativeCli();
}

const bundleOutput = getFlagValue('--bundle-output');
if (!bundleOutput || !bundleOutput.includes(`${path.sep}rescue${path.sep}`)) {
  delegateToReactNativeCli();
}

const tempRoot = prepareTempProjectRoot();
const tempEntryFile = path.join(tempRoot, 'index.js');
writeBabelConfig(tempRoot, path.join(repoRoot, 'node_modules'));
const tempMetroConfig = writeMetroConfig(tempRoot, path.join(repoRoot, 'node_modules'));

setFlagValue('--entry-file', tempEntryFile);
setFlagValue('--config', tempMetroConfig);

console.log(`[bundle-shim] Bundling rescue variant from staged root: ${tempRoot}`);
delegateToReactNativeCli(repoRoot);
