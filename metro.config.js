const {getDefaultConfig, mergeConfig} = require('@react-native-community/cli-config');

const defaultConfig = getDefaultConfig(__dirname);
const config = {};
module.exports = mergeConfig(defaultConfig, config);