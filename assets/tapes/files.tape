# Render from the repo root: vhs assets/tapes/files.tape
# VHS cannot click, so the program replays a scripted mouse (--demo) through the real zone hit-testing.
Output assets/files.gif

Set Shell bash
Set FontSize 16
Set Width 1100
Set Height 640
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms

Hide
Type "export PS1='> ' && clear"
Enter
Show

Type "bun examples/files.ts --demo"
Sleep 300ms
Enter
Sleep 36s
