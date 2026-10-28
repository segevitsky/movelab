const path = require('path');

// babel-preset-expo ships nested under node_modules/expo (legacy peer-deps layout), so resolve it from there.
const expoDir = path.dirname(require.resolve('expo/package.json'));
const preset = require.resolve('babel-preset-expo', { paths: [expoDir, __dirname] });

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [preset],
    // drizzle migrations are plain .sql files bundled as strings
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
