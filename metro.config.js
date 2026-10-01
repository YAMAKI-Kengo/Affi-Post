const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
// サーバー（Cloudflare Workers）のコードはアプリのバンドル対象外
config.resolver.blockList = [new RegExp(`${path.resolve(__dirname, 'server').replace(/[\/]/g, '[\/]')}[\/].*`)];

module.exports = config;
