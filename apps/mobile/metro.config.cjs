const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);
// Local packages have no runtime dependencies. Preserve the existing app install
// and expose only their sources, without widening Metro to generated output/data.
// This repo uses separate npm prefixes, not a hoisted npm workspace installation.
config.watchFolders = [...new Set([...config.watchFolders, path.resolve(__dirname, '../../packages')])];
module.exports = config;
