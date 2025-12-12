# Replay Studio Quick Start Guide

Get up and running with Replay Studio in minutes! This guide covers the essential features to start creating video annotations.

## Installation

### Download and Install

1. Download the installer for your platform from the releases page
2. Run the installer and follow the prompts
3. Launch Replay Studio from your applications menu

### Building from Source

```bash
# Clone the repository
git clone <repository-url>
cd replay-studio

# Install dependencies
npm install

# Start development server
npm run dev

# Or build for production
npm run build
```

## First Steps

### 1. Load a Video

There are three ways to load a video:

**Method 1: Drag and Drop** (Easiest)
- Drag a video file from your file explorer
- Drop it anywhere in the Replay Studio window
- The video will load automatically

**Method 2: Open Button**
- Click the "Open Video" button in the top-right corner
- Browse to your video file
- Click "Open"

**Method 3: Recent Files**
- If you've loaded videos before, they'll appear on the welcome screen
- Click any recent file to reload it

### 2. Play Your Video

Once loaded, you can control playback:

- **Play/Pause**: Click the video or press `Space`
- **Timeline**: Click anywhere on the timeline to jump to that time
- **Frame-by-Frame**: Use `←` and `→` arrow keys
- **Jump to Start/End**: Press `Home` or `End`

### 3. Choose a Drawing Tool

Select a tool from the left sidebar:

- **Pen (P)**: Freehand drawing
- **Arrow (A)**: Draw arrows to point at things
- **Rectangle (R)**: Draw boxes around areas
- **Text (T)**: Add text labels
- **Spotlight (S)**: Highlight specific areas

### 4. Draw Your First Annotation

1. **Pause the video** at the point where you want to add an annotation
2. **Select a tool** (try the Pen tool by pressing `P`)
3. **Choose a color** from the color swatches in the left sidebar
4. **Draw on the video** by clicking and dragging
5. Your annotation appears and will stay visible for 5 seconds of video time

### 5. Navigate Annotations

Annotations are time-based:
- They appear at specific times in the video
- Scrub the timeline to see when annotations appear
- The annotation timeline (below the video) shows all your annotations

## Essential Features

### Setting In/Out Points

Mark a specific section of video for export:

1. Play to your desired start point
2. Press `I` to set the In point (green marker appears)
3. Play to your desired end point
4. Press `O` to set the Out point (red marker appears)
5. Jump between them with `[` and `]` keys

### Using Different Tools

**Pen Tool (P)**
- Click and drag to draw freehand
- Great for circling things or adding arrows
- Release mouse to finish

**Arrow Tool (A)**
- Click where you want the arrow to start
- Drag to where you want it to point
- Release to create the arrow

**Rectangle Tool (R)**
- Click one corner
- Drag to the opposite corner
- Release to create the rectangle

**Text Tool (T)**
- Click where you want the text
- Type your message
- Click outside to finish

**Spotlight Tool (S)**
- Click and drag to create a highlighted area
- Everything outside the spotlight is dimmed
- Great for focusing attention

### Customizing Your Drawings

**Change Color**
- Click any color swatch in the left sidebar
- Or press number keys `1-9` for quick color selection

**Change Stroke Width**
- Click one of the stroke width buttons (circles of different sizes)
- Thicker lines are more visible, thinner for detail

**Undo/Redo**
- Made a mistake? Press `Ctrl+Z` to undo
- Changed your mind? Press `Ctrl+Y` to redo

### Exporting Your Work

When you're ready to save your annotated video:

1. **Click the "Export" button** in the top-right corner
2. **Choose your format**:
   - MP4 for video files
   - GIF for short animations
3. **Select quality**:
   - High (1080p) for best quality
   - Medium (720p) for balanced size/quality
   - Low (480p) for smaller files
4. **Choose what to export**:
   - Toggle "Use In/Out points" to export only selected range
   - Toggle "Include annotations" to export with or without drawings
5. **Click "Export"** and choose where to save

## Keyboard Shortcuts Cheat Sheet

### Most Important

| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `P` | Pen tool (draw) |
| `A` | Arrow tool |
| `V` | Select tool (move things) |
| `I` | Set In point |
| `O` | Set Out point |
| `Ctrl+Z` | Undo |
| `?` | Show all shortcuts |

### Pro Tips

Press `?` at any time to see the full keyboard shortcuts reference!

## Common Workflows

### Creating a Sports Analysis

1. Load game footage
2. Find a play you want to analyze
3. Set In/Out points around the play
4. Use the Pen tool to circle players
5. Use the Arrow tool to show player movement
6. Add Text annotations to label players or plays
7. Export as MP4 to share

### Making a Tutorial

1. Load your screen recording
2. Pause at important moments
3. Use Rectangle tool to highlight UI elements
4. Use Arrow tool to point at buttons
5. Add Text to explain steps
6. Export with annotations to create clear tutorial

### Game Clip Highlighting

1. Load gameplay footage
2. Find your best moments
3. Set In/Out points for each clip
4. Add Spotlight to focus on key action
5. Use Text for commentary
6. Export individual clips or full video

## Tips for Best Results

### Drawing Tips

- **Pause before drawing**: Easier to be precise when video is paused
- **Use Select tool (V)**: Move or resize annotations after creating them
- **Layer your annotations**: Newer drawings appear on top
- **Keep it simple**: Too many annotations can be distracting

### Performance Tips

- **Close other applications**: Free up system resources
- **Use lower quality videos**: If experiencing lag during playback
- **Clear annotations**: Use the trash button to remove all and start fresh
- **Save often**: Use export to save your work periodically

### Export Tips

- **Test first**: Export a short section before exporting the whole video
- **Use In/Out points**: Export only what you need to save time
- **Choose appropriate quality**: High quality = large files
- **Name your files clearly**: Include date or description in filename

## Troubleshooting

### Video Won't Load

- **Check format**: Ensure it's MP4, WebM, AVI, MOV, or MKV
- **Try drag-and-drop**: Sometimes works when file picker doesn't
- **Check file path**: Make sure there are no special characters

### Annotations Disappear

- **Check video time**: Annotations only appear during their time range
- **Scrub timeline**: Use the timeline to see when annotations are visible
- **Check layer**: Make sure annotation isn't behind another

### Performance Issues

- **Close background apps**: Free up RAM and CPU
- **Reduce video quality**: Use a lower resolution source video
- **Clear annotations**: Remove unnecessary annotations
- **Restart app**: Sometimes helps clear memory

## Getting Help

- Press `?` to see keyboard shortcuts
- Check the README.md for detailed documentation
- Look at ARCHITECTURE.md for technical details
- Report issues on GitHub

## Next Steps

Now that you're familiar with the basics:

1. **Explore all the tools**: Try the Spotlight, Magnifier, and Tracker tools
2. **Learn advanced shortcuts**: Memorize J/K/L for professional video navigation
3. **Experiment with colors and styles**: Create your signature annotation style
4. **Share your work**: Export and share your annotated videos

---

**Happy Annotating!**

Visit the full documentation for advanced features and detailed guides.
