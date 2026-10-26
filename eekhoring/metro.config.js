const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// @powersync/adapter-sql-js imports node:fs / node:crypto, but only uses them when running under Node.
const nodeOnly = ['node:fs', 'node:crypto'];
config.resolver.resolveRequest = (context, moduleName, platform) =>
  nodeOnly.includes(moduleName) ? { type: 'empty' } : context.resolveRequest(context, moduleName, platform);

module.exports = config;
