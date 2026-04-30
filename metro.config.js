const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);
const config = {};
module.exports = mergeConfig(defaultConfig, config);