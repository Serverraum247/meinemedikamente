const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const blockedRoots = [
  'android',
  'ios',
  'docs',
  'vendor',
  'store-assets',
].map(dir => path.resolve(__dirname, dir));
const nodeModulesRoot = path.resolve(__dirname, 'node_modules');

const config = {
  resolver: {
    // Metro must not crawl generated native build artifacts; they are huge here
    // and can stall bundle resolution on physical-device debug starts.
    //
    // This workspace also contains accidental duplicate package trees like
    // `react-native/ReactCommon 2`, which can make Metro recurse into shadow
    // copies and hang or mis-resolve modules.
    blockList: [
      ...blockedRoots.map(root => new RegExp(`^${escapeForRegExp(root)}\\/.*$`)),
      new RegExp(`^${escapeForRegExp(nodeModulesRoot)}\\/.*\\s\\d+(?:\\/.*)?$`),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
