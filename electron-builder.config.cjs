// electron-builder configuration
// Custom no-op sign function to skip code signing while allowing icon embedding

// Determine build target from CLI args or env
const buildTarget = process.env.BUILD_TARGET || "dir";

module.exports = {
  appId: "com.visualillusion.app",
  productName: "VisualIllusion",
  copyright: "© 2026 VisualIllusion. All rights reserved.",
  asar: false,
  afterPack: "./scripts/afterPack.js",
  directories: {
    output: "dist-electron-new",
  },
  files: [
    "electron/**",
    "launcher.js",
    "version.json",
    "server/**",
    "public/**",
    ".env.local",
    ".next/standalone/**",
    ".next/static/**",
    "!node_modules/electron/**",
    "!node_modules/electron-builder/**",
    "!node_modules/rcedit/**",
    "!node_modules/png-to-ico/**",
    "!.next/standalone/downloads/**",
    "!.next/standalone/dist/**",
    "!.next/standalone/dist-electron/**",
    "!.next/standalone/dist-electron-new/**",    "!.next/standalone/dist-electron-*/**",    "!.next/standalone/dist-installer/**",
    "!.next/standalone/build/**",
    "!.next/standalone/.pkg-cache/**",
    "!.next/standalone/.build-tmp/**",
    "!.next/standalone/installer/**",
    "!.next/standalone/VisualIllusion.exe",
  ],
  extraResources: [
    {
      from: "node_modules/cloudflared/bin/cloudflared.exe",
      to: "cloudflared.exe",
    },
  ],
  win: {
    icon: "public/visualillusion_white.ico",
    signAndEditExecutable: false,
    signExts: [],
    target: [
      {
        target: buildTarget,
        arch: ["x64"],
      },
    ],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: true,
    createDesktopShortcut: "always",
    createStartMenuShortcut: true,
    shortcutName: "VisualIllusion",
    installerIcon: "public/visualillusion_white.ico",
    uninstallerIcon: "public/visualillusion_white.ico",
    installerHeaderIcon: "public/visualillusion_white.ico",
    installerSidebar: "build/installerSidebar.bmp",
    uninstallerSidebar: "build/installerSidebar.bmp",
    license: undefined,
    runAfterFinish: true,
    deleteAppDataOnUninstall: false,
    include: "build/installer.nsh",
    artifactName: "VisualIllusion Installer.${ext}",
    unicode: true,
    // Custom display name
    menuCategory: false,
    installerLanguages: undefined,
    language: 1049, // Russian
  },
};
