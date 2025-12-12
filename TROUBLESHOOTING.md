# Troubleshooting Guide

Solutions to common issues and problems in Replay Studio.

## Table of Contents

1. [Video Loading Issues](#video-loading-issues)
2. [Playback Problems](#playback-problems)
3. [Drawing and Annotation Issues](#drawing-and-annotation-issues)
4. [Export Problems](#export-problems)
5. [Performance Issues](#performance-issues)
6. [Application Errors](#application-errors)
7. [Platform-Specific Issues](#platform-specific-issues)

## Video Loading Issues

### Video File Won't Load

**Symptoms**: Video doesn't appear after selecting file, error message shown, or blank screen.

**Solutions**:

1. **Check file format**
   - Supported: MP4, WebM, MKV, AVI, MOV
   - Verify your file has one of these extensions
   - Try converting to MP4 if using an unusual format

2. **Verify file isn't corrupted**
   - Open the video in another player (VLC, Windows Media Player)
   - If it doesn't play elsewhere, the file may be corrupted
   - Re-export or re-download the video

3. **Check file path**
   - Avoid special characters in filename or folder path
   - Move video to a simpler location (e.g., Desktop)
   - Example: `C:\Videos\my-video.mp4` instead of `C:\Users\John O'Brien\My Videos\Video (1).mp4`

4. **Try drag-and-drop**
   - File picker may have permission issues
   - Drag the file directly into the application window
   - This often works when the file picker doesn't

5. **Check file permissions**
   - Ensure you have read access to the file
   - On Windows: Right-click → Properties → Security
   - On macOS/Linux: Check file permissions with `ls -la`

### Video Shows Error "Codec Not Supported"

**Cause**: The video uses a codec that Chromium/Electron doesn't support.

**Solutions**:

1. **Convert to H.264 MP4**
   - Use HandBrake or FFmpeg to convert
   - H.264 codec in MP4 container has best compatibility
   - Command: `ffmpeg -i input.mov -c:v libx264 output.mp4`

2. **Update Replay Studio**
   - Newer versions may support additional codecs
   - Check for updates

3. **Check video details**
   - Use MediaInfo or similar tool to check codec
   - Look for H.264, H.265, VP8, or VP9 for best compatibility

### Drag-and-Drop Doesn't Work

**Solutions**:

1. **Try dragging to different area**
   - Drag directly to the center of the window
   - Avoid dragging to toolbar or edges

2. **Check file type**
   - Ensure it's actually a video file
   - Look at file extension, not just icon

3. **Use Open button instead**
   - Click "Open Video" in top-right
   - Browse to file manually

4. **Run as administrator (Windows only)**
   - Some permission issues require elevated privileges
   - Right-click app → "Run as administrator"

## Playback Problems

### Video Plays Choppy or Stutters

**Solutions**:

1. **Close other applications**
   - Free up RAM and CPU resources
   - Close browser tabs, other video editors, etc.

2. **Reduce video quality**
   - Use a lower resolution source video
   - 720p often plays smoother than 4K

3. **Disable hardware acceleration** (if available)
   - May help with graphics driver issues
   - Check application settings

4. **Update graphics drivers**
   - Outdated drivers can cause playback issues
   - Visit your GPU manufacturer's website

5. **Clear annotations**
   - Too many annotations can impact performance
   - Use the clear button to remove all and test

### Audio Out of Sync

**Cause**: Variable frame rate (VFR) videos can cause sync issues.

**Solutions**:

1. **Convert to constant frame rate (CFR)**
   - Use FFmpeg: `ffmpeg -i input.mp4 -vsync cfr output.mp4`
   - This ensures consistent timing

2. **Re-export from source**
   - If you created the video, export with CFR enabled
   - Most professional software has this option

### Seeking is Slow or Inaccurate

**Solutions**:

1. **Use frame-by-frame controls**
   - Press `←` and `→` for precise navigation
   - More accurate than timeline scrubbing

2. **Re-encode video**
   - Some codecs don't have good keyframe distribution
   - Re-encode with more frequent keyframes
   - FFmpeg: `ffmpeg -i input.mp4 -g 30 output.mp4`

3. **Pause before seeking**
   - Seeking while playing can be less accurate
   - Press `Space` to pause, then seek

## Drawing and Annotation Issues

### Annotations Don't Appear

**Symptoms**: Draw on canvas but nothing shows up.

**Solutions**:

1. **Check you're at the right time**
   - Annotations are time-based
   - Scrub timeline to see when annotation appears
   - Default duration is 5 seconds from creation time

2. **Verify tool is selected**
   - Ensure a drawing tool is active (not Select tool)
   - Tool button should be highlighted blue

3. **Check color isn't transparent**
   - Ensure stroke color is visible
   - Try selecting red (press `1`)

4. **Complete the drawing gesture**
   - For shapes: Click, drag, then release
   - For pen: Draw then release mouse
   - Incomplete gestures don't create objects

### Annotations Disappear Immediately

**Cause**: Annotations have time ranges and only show during that time.

**Solutions**:

1. **Check video position**
   - Annotations appear from creation time for 5 seconds
   - Example: Created at 10s → visible from 10s to 15s
   - Scrub timeline to verify

2. **Pause before drawing**
   - Drawing while playing uses the time at mouse-down
   - Pause first for predictable timing

3. **Adjust annotation timing** (future feature)
   - Currently timing is automatic
   - Future versions will allow manual adjustment

### Can't Select or Move Annotations

**Solutions**:

1. **Switch to Select tool**
   - Press `V` or click the selection tool
   - Only Select tool can move/modify annotations

2. **Click directly on annotation**
   - Must click the annotation itself, not near it
   - Try clicking the stroke/outline

3. **Check if annotation is visible**
   - Annotations outside their time range can't be selected
   - Seek to the time when annotation is visible

### Drawing is Laggy or Delayed

**Solutions**:

1. **Reduce canvas size**
   - Lower resolution videos have smaller canvas
   - Resize window to smaller size

2. **Use simpler tools**
   - Pen tool is more resource-intensive than shapes
   - Try using Line or Rectangle tools

3. **Clear old annotations**
   - Remove annotations you don't need
   - Each annotation adds to rendering load

4. **Pause video while drawing**
   - Drawing while playing is more demanding
   - Press `Space` to pause first

### Colors Look Different After Drawing

**Cause**: Color rendering differences or semi-transparency.

**Solutions**:

1. **Check opacity**
   - Some tools use semi-transparent colors
   - Example: Spotlight uses rgba with alpha

2. **Verify color selection**
   - Ensure the color you wanted is actually selected
   - Color swatch should have white border

3. **Canvas overlay effects**
   - Some drawing modes blend with video
   - This is expected behavior for certain tools

## Export Problems

### Export Button Doesn't Work

**Solutions**:

1. **Ensure video is loaded**
   - Export only available when video is present
   - Load a video first

2. **Check Electron API**
   - Export requires desktop application (not web browser)
   - Ensure you're running the Electron app

3. **Verify file permissions**
   - Check you have write access to export location
   - Try exporting to Desktop instead

### Export Fails or Shows Error

**Solutions**:

1. **Choose different save location**
   - Some folders have restricted permissions
   - Try saving to Documents or Desktop

2. **Check disk space**
   - Ensure you have enough free space for export
   - Video exports can be large (GB+ for high quality)

3. **Simplify filename**
   - Avoid special characters in export filename
   - Use only letters, numbers, dashes, underscores

4. **Reduce export quality**
   - Start with lower quality to test
   - High quality exports take longer and need more resources

### Export is Very Slow

**Current Limitation**: Export uses simplified implementation. Full FFmpeg integration planned.

**Workarounds**:

1. **Export shorter clips**
   - Use In/Out points to export only needed section
   - Multiple short exports faster than one long export

2. **Reduce quality/resolution**
   - Lower quality exports process faster
   - Use Medium or Low quality settings

3. **Close other applications**
   - Free up system resources
   - Export is CPU/GPU intensive

### Exported Video Missing Annotations

**Solutions**:

1. **Check "Include annotations" is enabled**
   - In export dialog, verify checkbox is checked
   - This option must be ON to include drawings

2. **Verify annotations are in export range**
   - If using In/Out points, annotations must be within range
   - Check annotation timeline

3. **Wait for export to complete**
   - Don't close dialog until "Export complete" shows
   - Progress bar should reach 100%

## Performance Issues

### Application is Slow to Start

**Solutions**:

1. **Clear recent files**
   - Large recent files list can slow startup
   - Remove old entries from welcome screen

2. **Close other Electron apps**
   - Multiple Electron apps compete for resources
   - Close Slack, Discord, VS Code, etc.

3. **Restart computer**
   - Clears memory leaks and resets resources
   - Simple but often effective

### High Memory Usage

**Solutions**:

1. **Clear annotations**
   - Remove unnecessary annotations
   - Use clear all button and start fresh

2. **Close and reopen**
   - Restart application to clear memory
   - Memory leaks cleared on restart

3. **Use smaller videos**
   - Lower resolution videos use less memory
   - Convert to 720p if using 4K source

4. **Limit annotation count**
   - Keep annotations under 100 for best performance
   - Delete old annotations regularly

### Application Freezes or Crashes

**Solutions**:

1. **Update to latest version**
   - Bugs fixed in newer releases
   - Check GitHub releases page

2. **Check system requirements**
   - Ensure your computer meets minimum specs
   - 8GB RAM recommended minimum

3. **Disable antivirus temporarily**
   - Some antivirus software interferes
   - Test with antivirus disabled (temporarily)

4. **Check Electron DevTools console**
   - Press `Ctrl+Shift+I` to open DevTools
   - Look for JavaScript errors in console
   - Report errors in GitHub issues

## Application Errors

### "Cannot read property of undefined" Errors

**Common during development**

**Solutions**:

1. **Refresh application**
   - Press `Ctrl+R` or `Cmd+R` to reload
   - Often fixes state issues

2. **Clear application data**
   - Close and restart application
   - Data cleared on full restart

3. **Report the issue**
   - Note what you were doing when error occurred
   - Open GitHub issue with reproduction steps

### Canvas Not Responding

**Solutions**:

1. **Click on video area**
   - Ensure video/canvas has focus
   - Click once to activate

2. **Switch tools**
   - Press `V` then back to desired tool
   - Sometimes resets tool state

3. **Reload application**
   - Press `Ctrl+R` to reload renderer
   - Full restart if that doesn't work

## Platform-Specific Issues

### Windows

**Video codec issues**
- Install K-Lite Codec Pack
- Ensures all common codecs available
- Even though Chromium decodes, system codecs help

**Path length problems**
- Windows has 260 character path limit
- Move videos to shorter path locations

**Permission errors**
- Run as administrator if permission denied
- Check Windows Defender isn't blocking

### macOS

**Gatekeeper warnings**
- Right-click app → Open (first time)
- Or: System Preferences → Security → Allow

**Video permission prompts**
- Grant camera/microphone access if prompted
- Even though not using camera, may be requested

**Retina display issues**
- High DPI displays may cause scaling issues
- Currently expected; fixes planned

### Linux

**Missing dependencies**
- Install: `libgtk-3-0 libnotify4 libnss3 libxss1`
- Required for Electron on some distros

**Video codec support**
- Install ffmpeg: `sudo apt install ffmpeg`
- Provides additional codec support

**Wayland vs X11**
- Some features work better on X11
- Try switching if experiencing issues

## Getting More Help

### Enable Debug Mode

1. Press `Ctrl+Shift+I` (or `Cmd+Option+I` on Mac)
2. Open Console tab
3. Look for errors or warnings
4. Screenshot and include in bug reports

### Report a Bug

Include in your report:
- Replay Studio version
- Operating system and version
- Video file format and codec
- Steps to reproduce
- Screenshots or error messages
- Console errors (from DevTools)

### Check GitHub Issues

- Search existing issues first
- Your problem may already be reported
- Check closed issues for solutions
- Add details to existing issues if relevant

### Community Support

- Check project discussions on GitHub
- Ask in project Discord/Slack (if available)
- Read documentation thoroughly first

## Preventive Maintenance

### Best Practices

1. **Keep software updated**
   - Check for Replay Studio updates regularly
   - Update operating system and drivers

2. **Use compatible formats**
   - Stick to MP4 with H.264 codec
   - Convert problematic videos before importing

3. **Save work frequently**
   - Export periodically to save progress
   - Application doesn't auto-save (yet)

4. **Manage annotations**
   - Delete unneeded annotations
   - Don't let count grow too large

5. **Monitor performance**
   - Watch for slowdowns
   - Clear and restart before issues become severe

---

**Still having issues?** Open an issue on GitHub with details about your problem!
