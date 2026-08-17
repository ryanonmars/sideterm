<p align="center">
  <img src="src/extension/public/icons/sideterm.png" width="128" alt="SideTerm logo">
</p>

<h1 align="center">SideTerm</h1>

<p align="center">
  A real terminal in your browser's resizable side panel.
</p>

SideTerm keeps a full terminal beside your normal browser tabs, so you can code with AI, run development tools, or monitor a process without covering the page you are using. Your browser still handles websites, accounts, extensions, streaming, media codecs, and DRM normally.

## Features

- A real macOS login shell powered by a local native helper
- Multiple terminal tabs with custom names
- Side-by-side or top-and-bottom terminal stacks
- Resizable using the browser's standard side-panel controls
- Tabs, names, layout, recent output, and running processes survive closing the side panel
- No access to webpage content or browsing history

## Install

1. [Add SideTerm from the Chrome Web Store](https://chromewebstore.google.com/detail/sideterm/iibepfapncodkkpognfeamilpdkoimbe).
2. Download and run the macOS SideTerm Helper from the [latest release](https://github.com/ryanonmars/sideterm/releases/latest).
3. Restart Chrome or Brave after installing the helper.
4. Pin SideTerm to the toolbar and click its icon to open the side panel.

SideTerm currently supports macOS. The [native helper](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) is required because browser extensions cannot launch a real local shell by themselves.

## Using SideTerm

- Click **+** to open another terminal.
- Click the **pencil** to rename a terminal.
- Click **expand** to keep a terminal visible in the stack.
- Choose the vertical or horizontal layout button to arrange stacked terminals.
- Click **×** to close a terminal. SideTerm always keeps at least one terminal available.

Each new terminal starts in your home folder using your configured login shell. Closing the side panel keeps its terminals running. Fully quitting the browser ends all terminal processes; the saved tabs and layout return with fresh shells the next time SideTerm opens.

## Privacy and security

SideTerm does not inject scripts into websites and does not request permission to read page content or browsing history. Terminal input and output stay between the extension and the local SideTerm Helper. Programs you run inside the terminal retain their own network and privacy behavior.

## Troubleshooting

- **Specified native messaging host not found:** reinstall the SideTerm Helper, restart the browser, and click **Reconnect**.
- **Disconnected:** click **Reconnect**. If it disconnects again, reinstall the helper.
- **Shell exited:** click the restart icon on that terminal tab, or close it and create another terminal.

## Development

Requirements: macOS, Node.js 20.19 or newer, npm, and Xcode Command Line Tools.

```bash
git clone https://github.com/ryanonmars/sideterm.git
cd sideterm
npm install
npm run install:dev
```

The development installer builds SideTerm, registers the native helper, and prints the unpacked extension directory. Load that directory from `chrome://extensions` or `brave://extensions` with Developer mode enabled.

```bash
npm test          # Run the test suite
npm run typecheck # Check TypeScript
npm run build     # Build the extension and native helper
```

## Support

Report bugs or request features through [GitHub Issues](https://github.com/ryanonmars/sideterm/issues).
