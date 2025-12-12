# Contributing to Replay Studio

Thank you for your interest in contributing to Replay Studio! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- Node.js 16+ and npm
- Git
- Basic understanding of TypeScript, React, and Electron
- Familiarity with Fabric.js for canvas-related contributions

### Development Setup

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/replay-studio.git
   cd replay-studio
   ```
3. Add the upstream repository:
   ```bash
   git remote add upstream https://github.com/ORIGINAL_OWNER/replay-studio.git
   ```
4. Install dependencies:
   ```bash
   npm install
   ```
5. Start the development server:
   ```bash
   npm run dev
   ```

## Code Style Guidelines

### TypeScript

- Use TypeScript for all new code
- Define proper types and interfaces
- Avoid using `any` type unless absolutely necessary
- Use functional components with hooks for React components
- Prefer `const` over `let` when variables won't be reassigned

### React Components

- Use functional components with hooks
- Keep components focused and single-purpose
- Extract reusable logic into custom hooks
- Use meaningful component and prop names
- Add TypeScript interfaces for all props

Example:
```typescript
interface MyComponentProps {
  title: string
  onClose: () => void
}

export default function MyComponent({ title, onClose }: MyComponentProps) {
  // Component implementation
}
```

### State Management

- Use Zustand stores for global state
- Keep local state in components when it doesn't need to be shared
- Follow existing store patterns for consistency
- Document complex state interactions

### Styling

- Use Tailwind CSS utility classes
- Follow existing color scheme and spacing patterns
- Avoid inline styles when possible
- Use consistent class ordering (layout -> spacing -> colors -> typography)

### File Organization

- Place components in appropriate subdirectories under `src/components/`
- Create custom hooks in `src/hooks/`
- Add state stores to `src/stores/`
- Keep components small and focused

## Development Workflow

### Branch Naming

Use descriptive branch names with prefixes:
- `feature/` - New features
- `fix/` - Bug fixes
- `refactor/` - Code refactoring
- `docs/` - Documentation updates
- `test/` - Test additions or updates

Examples:
- `feature/add-zoom-tool`
- `fix/export-timing-bug`
- `refactor/video-store`

### Commit Messages

Write clear, descriptive commit messages:
- Use present tense ("Add feature" not "Added feature")
- Start with a capital letter
- Keep first line under 72 characters
- Add detailed description for complex changes

Good examples:
```
Add magnification tool for video analysis

Implements a circular magnifier tool that allows users to zoom into
specific areas of the video. The magnifier follows the cursor and
can be resized by the user.
```

```
Fix timeline scrubbing accuracy

Corrects the calculation of video time from mouse position on the
timeline. Previously, rounding errors caused jumps when scrubbing.
```

### Pull Request Process

1. **Update your fork** with the latest changes from upstream:
   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

2. **Create a feature branch** from main:
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes** following the code style guidelines

4. **Test your changes** thoroughly:
   - Test with different video formats
   - Verify keyboard shortcuts still work
   - Check that existing features aren't broken
   - Test on different screen sizes if UI changes

5. **Commit your changes** with clear commit messages

6. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

7. **Open a Pull Request** on GitHub:
   - Use a clear, descriptive title
   - Describe what changes you made and why
   - Reference any related issues
   - Include screenshots for UI changes
   - List any breaking changes

### Pull Request Template

```markdown
## Description
Brief description of what this PR does

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe how you tested these changes

## Screenshots
If applicable, add screenshots or GIFs

## Checklist
- [ ] Code follows project style guidelines
- [ ] Changes have been tested
- [ ] Documentation has been updated if needed
- [ ] No new warnings or errors introduced
```

## Areas for Contribution

### High Priority

- **Export Functionality**: Integrate FFmpeg for production-quality video export
- **Performance Optimization**: Improve rendering performance for complex annotations
- **Audio Waveform**: Add audio waveform visualization to timeline
- **Annotation Import/Export**: Save and load annotation data as JSON

### Medium Priority

- **Additional Drawing Tools**: Circle crop, blur/pixelate, polygons
- **Layer Management**: Better organization of annotations across layers
- **Customizable Shortcuts**: Allow users to configure keyboard shortcuts
- **Preset Templates**: Save and load drawing style presets

### Good First Issues

- **UI Improvements**: Color picker enhancements, better tooltips
- **Documentation**: Improve inline code comments, add JSDoc
- **Error Handling**: Better error messages and user feedback
- **Accessibility**: Improve keyboard navigation, screen reader support

## Code Review Process

### What We Look For

- **Functionality**: Does it work as intended?
- **Code Quality**: Is it readable, maintainable, and well-structured?
- **Testing**: Has it been adequately tested?
- **Documentation**: Are changes documented appropriately?
- **Performance**: Does it introduce performance issues?
- **Compatibility**: Does it work across platforms?

### Responding to Feedback

- Be open to constructive criticism
- Ask questions if feedback isn't clear
- Make requested changes promptly
- Explain your reasoning if you disagree
- Update your PR based on feedback

## Testing Guidelines

### Manual Testing

Before submitting a PR, test:
1. Video loading (drag-drop and file picker)
2. All drawing tools work correctly
3. Keyboard shortcuts function properly
4. In/Out points can be set and used
5. Undo/Redo works as expected
6. Export dialog opens and validates settings

### Browser DevTools

Use Electron's DevTools for debugging:
- Press `Ctrl+Shift+I` (or `Cmd+Option+I` on Mac) to open DevTools
- Check console for errors and warnings
- Use React DevTools for component inspection
- Monitor performance with Performance tab

## Architecture Overview

### Component Hierarchy

```
App
├── VideoPlayer
│   ├── VideoControls
│   └── DrawingCanvas
│       └── Various drawing tools
├── DrawingToolbar
├── AnnotationTimeline
├── ShortcutsHelp (modal)
└── ExportDialog (modal)
```

### State Flow

- User interactions → Component handlers
- Handlers → Zustand store actions
- Store updates → Component re-renders
- Side effects → useEffect hooks

### Electron IPC

- Renderer → Main: File dialogs, save operations
- Main → Renderer: File opened events, menu actions

## Common Development Tasks

### Adding a New Drawing Tool

1. Add tool type to `src/stores/toolStore.ts`
2. Create tool implementation in `src/components/Canvas/tools/`
3. Add button to `src/components/Toolbar/DrawingToolbar.tsx`
4. Implement mouse/touch handlers in `DrawingCanvas.tsx`
5. Add keyboard shortcut in `src/hooks/useKeyboardShortcuts.ts`
6. Update `ShortcutsHelp.tsx` with new shortcut

### Adding a New Zustand Store

1. Create new store file in `src/stores/`
2. Define state interface and actions
3. Export custom hook (e.g., `useMyStore`)
4. Import and use in components
5. Document store purpose and usage

### Modifying Electron Behavior

1. Edit `electron/main.ts` for main process changes
2. Update `electron/preload.js` for IPC bridge
3. Update `src/types/electron.d.ts` for TypeScript types
4. Test in development mode before building

## Release Process

(For maintainers)

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Create git tag
4. Build for all platforms
5. Create GitHub release
6. Upload platform-specific installers

## Getting Help

- Check existing issues on GitHub
- Read the code documentation
- Ask questions in pull request comments
- Join project discussions

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on the code, not the person
- Help create a welcoming environment

## License

By contributing to Replay Studio, you agree that your contributions will be licensed under the project's license.

---

Thank you for contributing to Replay Studio!
