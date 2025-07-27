# Debug Setup for SSRI CKBoost Tests in VS Code/Cursor

## Quick Start

### 1. Install Required Extensions
Make sure you have these VS Code/Cursor extensions installed:
- **Jest** (by Orta) - For test runner integration
- **Jest Runner** - For running tests from the editor
- **JavaScript Debugger** (built-in)

### 2. Running Tests with Click

After the setup, you can:
- **Click the play button** next to any `describe` or `it` block in test files
- **Click "Debug"** above test blocks to run with breakpoints
- **Use CodeLens** links that appear above tests

### 3. Debug Configurations

Open the Debug panel (Ctrl+Shift+D or Cmd+Shift+D) to see these configurations:

1. **Jest: Current File** - Debug the entire test file you have open
2. **Jest: Current Test** - Debug only the selected test (highlight test name first)
3. **Jest: All Tests** - Run all tests with debugging
4. **Jest: Unit Tests Only** - Skip integration tests
5. **Jest: Integration Tests Only** - Run only integration tests (starts Docker)
6. **Jest: Debug With Breakpoints** - Enhanced debugging mode

### 4. Setting Breakpoints

1. Click in the gutter (left margin) of any TypeScript file to set a breakpoint
2. Breakpoints work in:
   - Test files (`*.test.ts`)
   - Source files (`src/**/*.ts`)
   - Even in generated files (with source maps)

### 5. Running Individual Tests

#### Method 1: CodeLens (Recommended)
```typescript
describe('MyTest', () => {
  it('should work', () => {  // <- "Run | Debug" links appear here
    expect(true).toBe(true);
  });
});
```

#### Method 2: Right-Click Menu
1. Right-click inside a test
2. Select "Run Jest" or "Debug Jest"

#### Method 3: Debug Panel
1. Open Debug panel (Ctrl+Shift+D)
2. Select a configuration
3. Press F5 or click the green play button

#### Method 4: Command Palette
1. Open Command Palette (Ctrl+Shift+P)
2. Type "Jest: Run"
3. Select the appropriate command

### 6. Debugging Tips

#### Inspect Variables
- Hover over variables to see their values
- Use the Debug Console to evaluate expressions
- Check the Variables panel for all local/closure variables

#### Step Through Code
- **F10** - Step Over (next line)
- **F11** - Step Into (go into function)
- **Shift+F11** - Step Out (exit current function)
- **F5** - Continue (to next breakpoint)

#### Conditional Breakpoints
1. Right-click on a breakpoint
2. Select "Edit Breakpoint"
3. Add a condition like `myVar === 'specific-value'`

### 7. Environment Variables

The debug configurations automatically load `.env.test`. To use different env:
1. Edit `.vscode/launch.json`
2. Add to the `env` section of any configuration

### 8. Docker Integration

For integration tests:
- Docker container starts automatically
- Check Tasks (Ctrl+Shift+B) for manual Docker control
- Use `start-ssri-docker` and `stop-ssri-docker` tasks

### 9. Troubleshooting

#### Tests Not Appearing
- Restart VS Code/Cursor
- Check that Jest extension is enabled
- Run "Jest: Start All Runners" from Command Palette

#### Breakpoints Not Working
- Ensure source maps are enabled (already configured)
- Try "Jest: Debug With Breakpoints" configuration
- Check that you're not in production build

#### Slow Test Execution
- Debugging is slower than normal execution
- Use "Run" instead of "Debug" when not needed
- Consider running specific tests only

### 10. Keyboard Shortcuts

- **Ctrl+Shift+D** - Open Debug panel
- **F5** - Start debugging
- **Shift+F5** - Stop debugging
- **Ctrl+Shift+F5** - Restart debugging
- **F9** - Toggle breakpoint
- **Ctrl+F5** - Run without debugging

## Advanced Configuration

### Custom Test Patterns

To debug tests matching a pattern:
1. Edit `.vscode/launch.json`
2. Add to args: `"--testNamePattern", "your pattern"`

### Timeout Configuration

Tests have a 5-minute timeout for debugging. To change:
1. Edit `jest.config.js`
2. Modify `testTimeout` value

### Skip Certain Tests

Add `.skip` to temporarily skip tests:
```typescript
it.skip('this test will be skipped', () => {
  // ...
});
```

Or use `.only` to run only specific tests:
```typescript
it.only('only this test will run', () => {
  // ...
});
```