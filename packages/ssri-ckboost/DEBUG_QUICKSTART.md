# Quick Start: Debug Tests in VS Code/Cursor

## 1-Minute Setup

### Install Extensions (if not already installed)
When you open this folder in VS Code/Cursor, you'll be prompted to install recommended extensions. Click "Install" when prompted.

Or manually install:
- **Jest** (by Orta)
- **Jest Runner**

### Run Tests with Click

After opening any test file (`.test.ts`), you'll see clickable options above each test:

```typescript
describe('MyTest', () => {
  it('should work', () => {  // <- "Run | Debug" links appear here
    expect(true).toBe(true);
  });
});
```

Just click:
- **Run** - to run the test normally
- **Debug** - to run with breakpoints enabled

### Set Breakpoints

Click in the left margin (gutter) of any line to set a breakpoint (red dot appears).

### Try It Now!

1. Open `src/example.test.ts`
2. Click the gutter on line 11 to set a breakpoint
3. Click "Debug" above the first test
4. The debugger will pause at your breakpoint!

### Debug Controls

When paused at a breakpoint:
- **F5** - Continue (run to next breakpoint)
- **F10** - Step Over (next line)
- **F11** - Step Into (go into function)
- **Shift+F11** - Step Out (exit function)

### View Variables

While paused:
- **Hover** over any variable to see its value
- Check the **Variables** panel on the left
- Use the **Debug Console** to evaluate expressions

### That's it! You're ready to debug.

For more advanced features, see [DEBUG_SETUP.md](./DEBUG_SETUP.md)