# Render from the repo root: vhs assets/tapes/list.tape
# VHS cannot click, so the program replays a scripted mouse (--demo) through the real zone hit-testing.
Output assets/list.gif

Set Shell bash
Set FontSize 16
Set Width 900
Set Height 560
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms

Hide
Type "export PS1='> ' && clear"
Enter
Show

Type "bun examples/list.ts --demo"
Sleep 300ms
Enter
Sleep 15.5s
