# SideTerm

A real terminal in Brave's resizable side panel. Brave remains the normal browser, so websites, tabs, passwords, extensions, media codecs, and DRM continue to work normally.

## Requirements

- macOS
- Brave
- Node.js 20.19 or newer
- npm and Xcode Command Line Tools

## Install for development

```bash
npm install
npm run install:dev
```

The installer prints the unpacked extension directory. Then:

1. Open `brave://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and choose `dist/extension` from this repository.
4. Confirm the extension ID is `iibepfapncodkkpognfeamilpdkoimbe`.
5. Pin SideTerm and click its toolbar icon to open the side panel.

Each terminal uses your normal login shell and starts in your home folder. Use `+` to create tabs, the pencil to rename them, the expand button to keep a terminal visible in the stack, and the layout controls to arrange visible terminals side by side or top and bottom. Tabs, custom names, layout, recent output, and running shells survive closing and reopening the side panel. Closing Brave ends all terminal sessions.

## Commands

```bash
npm test          # Run unit and lifecycle tests
npm run typecheck # Check TypeScript
npm run build     # Build the extension and native helper
npm run install:dev # Build and register the helper with Brave
```

After rebuilding, click **Reload** on SideTerm's card at `brave://extensions`. Rerun `npm run install:dev` whenever the native helper changes.

SideTerm keeps the existing `com.termside.terminal` helper ID so an installed Termside development helper continues working after the visible product rename. Run `npm run install:dev` when upgrading from VibeWatch or whenever the native helper changes.

## Troubleshooting

- **Specified native messaging host not found:** rerun `npm run install:dev`, then click **Reconnect**. If Brave still reports it missing, fully quit and reopen Brave once.
- **Extension ID mismatch:** remove the loaded copy and load this repository's `dist/extension` directory again.
- **Disconnected:** click **Reconnect**. If it immediately disconnects, rerun the installer.
- **Shell exited:** click the restart icon on that terminal tab, or close it and create a new tab.

Terminal sessions persist while their tabs or the side panel are hidden, but end when Brave closes. Packaged installation is deferred.
