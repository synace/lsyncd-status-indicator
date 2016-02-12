# lsyncd-status-indicator

lsyncd Monitor Applet for Cinnamon. A cinnamon applet for launching and checking the state of an lsyncd configuration.

### Dependencies

- cinnamon
- notify-send
- lsyncd

### Settings

1. **Refresh interval (sec)** - Specify the refresh interval in seconds. Default `5`
2. **Status file** - Select a lsyncd config (first argument to lsyncd) and status file (settings.statusFile) to be checked. Default `/run/shm/lsyncd.status`
3. **Config file** - Specify the path to a lsyncd configuration file.
4. **Mount commmand** - [Optional] Enter a command to run from the menu to mount a desired path.
5. **UnMount command** - [Optional] Enter a command to run from the menu to unmount a desired path.
