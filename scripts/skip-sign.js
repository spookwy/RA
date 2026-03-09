// Custom sign hook that skips code signing entirely.
// This prevents electron-builder from downloading winCodeSign
// which fails on non-admin Windows due to macOS symlinks in the archive.
exports.default = async function(configuration) {
  // Do nothing — skip signing
};
