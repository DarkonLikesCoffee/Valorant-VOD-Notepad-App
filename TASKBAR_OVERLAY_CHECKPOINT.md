# Overlay / Taskbar Issue — Engineering Checkpoint

## Original Problem

The overlay needs to:
- appear over VALORANT fullscreen
- not cause the Windows taskbar to appear
- remain usable while VALORANT is fullscreen exclusive
- allow the user to immediately type into the notepad
- prevent typed input from reaching VALORANT

## Initial Working Behavior

...

## Window-management experiments

...

## Keyboard-hook experiment

We introduced:
- native WH_KEYBOARD_LL hook
- native keyboard-hook.exe
- Electron ↔ native helper communication
- keyboard state tracking
- modifier detection
- UTF-8 / Unicode translation
- JSON event transport
- application hotkey interception

## Problems encountered

### Fixed
- normal typing multiplication
- Shift
- Caps Lock
- Delete
- Alt+N
- overlay typed input reaching VALORANT
- taskbar visibility

### Still broken
- Ctrl combinations
- some Windows/global combinations
- some application/editor shortcuts
- native/global keyboard behavior is not reliably preserved
- current native hook architecture is too invasive

## Important observations

...

## Current architecture

...

## Current state

...

## Decision / Next direction

The native keyboard-hook approach should NOT be considered the final
solution.

The next investigation should focus on the window/compositor architecture
and reproducing the behavior of overlays such as the Overwolf/VALORANT
Tracker overlay without replacing Windows keyboard handling.

## Rollback point

This commit intentionally preserves the entire experimental implementation
so it can be revisited if necessary.