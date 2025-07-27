# Debug Setup for CKBoost Monorepo

This guide explains how to debug tests in the CKBoost monorepo from the root directory.

**Note**: This project uses `pnpm` as the package manager. Make sure you have pnpm installed globally:
```bash
npm install -g pnpm
```

## Quick Start

1. **Open CKBoost root folder** in VS Code/Cursor
2. **Install recommended extensions** when prompted (or from Extensions view)
3. **Open any test file** in `packages/ssri-ckboost/src/**/*.test.ts`
4. **Click "Run | Debug"** links that appear above tests
5. **Set breakpoints** by clicking in the left margin

## Available Debug Configurations

Open the Debug panel (Ctrl/Cmd+Shift+D) to see these configurations:

### SSRI-CKBoost Tests
- **SSRI-CKBoost: Current File** - Debug the entire test file you have open
- **SSRI-CKBoost: Current Test** - Debug only the selected test
- **SSRI-CKBoost: All Tests** - Run all ssri-ckboost tests with debugging
- **SSRI-CKBoost: Unit Tests Only** - Skip integration tests
- **SSRI-CKBoost: Integration Tests** - Run only integration tests (starts Docker)
- **SSRI-CKBoost: Debug with Breakpoints** - Enhanced debugging mode

## Running Tests from Root

### Method 1: Click-to-Run (Recommended)
1. Open any test file from `packages/ssri-ckboost/src/`
2. You'll see "Run | Debug" links above each test
3. Click to run with or without debugging

### Method 2: Debug Panel
1. Open Debug panel (Ctrl/Cmd+Shift+D)
2. Select an "SSRI-CKBoost" configuration
3. Press F5 or click the green play button

### Method 3: Command Line
From the root directory:
```bash
# Run all ssri-ckboost tests
cd packages/ssri-ckboost && pnpm test

# Run specific test file
cd packages/ssri-ckboost && pnpm test protocol.simple.test.ts

# Run with Docker
cd packages/ssri-ckboost && pnpm test:docker
```

## Debugging Features

### Setting Breakpoints
- Click in the left margin of any TypeScript file
- Breakpoints work in both test files and source files
- Right-click breakpoints to add conditions

### Debug Controls
- **F5** - Continue to next breakpoint
- **F10** - Step Over (next line)
- **F11** - Step Into (enter function)
- **Shift+F11** - Step Out (exit function)

### Inspect Variables
- Hover over variables to see values
- Check Variables panel in Debug sidebar
- Use Debug Console for expressions

## Docker Management

For integration tests, Docker is managed automatically. You can also:

1. Use Tasks (Ctrl/Cmd+Shift+B):
   - `ssri-ckboost: start docker`
   - `ssri-ckboost: stop docker`

2. Or run manually:
   ```bash
   # Start Docker container
   docker run -d --name ckb-ssri-server-test -p 9090:9090 hanssen0/ckb-ssri-server
   
   # Stop and remove
   docker stop ckb-ssri-server-test && docker rm ckb-ssri-server-test
   ```

## Troubleshooting

### Tests not appearing in sidebar
1. Make sure Jest extension is installed
2. Restart VS Code/Cursor
3. Open Command Palette and run "Jest: Start All Runners"

### Breakpoints not working
1. Make sure you're debugging (not just running)
2. Check that TypeScript source maps are enabled
3. Try the "Debug with Breakpoints" configuration

### Can't find test files
The Jest extension looks for tests in all packages. If not found:
1. Check that test files match pattern: `*.test.ts` or `*.spec.ts`
2. Verify jest.config.js exists in the package
3. Run `pnpm install` in the package directory

## Working with Multiple Packages

While this setup focuses on ssri-ckboost, you can add debug configurations for other packages:

1. Copy the SSRI-CKBoost configurations in `.vscode/launch.json`
2. Replace `ssri-ckboost` with your package name
3. Update paths and working directories accordingly

## Tips

- Use `jest.virtualFolders` in settings.json to configure multiple packages
- The Jest extension will detect tests in all configured packages
- Each package can have its own jest.config.js
- Share common debug configurations at the root level

## Example Test

Try debugging this example:
1. Open `packages/ssri-ckboost/src/example.test.ts`
2. Set a breakpoint on line 11
3. Click "Debug" above the first test
4. Step through the code with F10

## Related Documentation

- Package-specific guide: `packages/ssri-ckboost/DEBUG_SETUP.md`
- Quick start: `packages/ssri-ckboost/DEBUG_QUICKSTART.md`
- Jest documentation: https://jestjs.io/docs/debugging