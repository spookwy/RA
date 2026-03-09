/**
 * electron-builder configuration for the VisualIllusion Web-Installer
 * Lightweight bootstrap: downloads app bundle from GitHub during installation.
 * No heavy tar/resources bundled — installer is ~20-60 MB.
 */
module.exports = {
  appId: "com.visualillusion.setup",
  productName: "VisualIllusion Installer",
  copyright: "© 2026 VisualIllusion. All rights reserved.",
  compression: "normal",
  asar: false,
  extraMetadata: {
    main: "installer/main.js",
  },
  directories: {
    output: "dist-installer",
  },
  files: [
    "installer/**",
    "public/visualillusion_white.ico",
    "public/visualillusion_white.png",
    "public/visualillusion_white_n.png",
    "package.json",
    "!node_modules/**",
  ],
  // No extraResources — bundle is downloaded from GitHub Releases during install
  forceCodeSigning: false,
  publish: null,
  win: {
    icon: "public/visualillusion_white.ico",
    signAndEditExecutable: false,
    signExts: [],
    target: [
      {
        target: "nsis",
        arch: ["x64"],
      },
    ],
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    runAfterFinish: false,
    deleteAppDataOnUninstall: true,
    createDesktopShortcut: false,
    createStartMenuShortcut: false,
    installerIcon: "public/visualillusion_white.ico",
    artifactName: "VisualIllusion Installer.${ext}",
    unicode: true,
    include: "build/installer-wrapper.nsh",
  },
};
