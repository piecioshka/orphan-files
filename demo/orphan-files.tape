Output demo/orphan-files.gif

Require orphan-files

Set Shell "bash"
Set Framerate 60
Set FontSize 13
Set Width 920
Set Height 640
Set Padding 20
Set Margin 5
Set MarginFill "#212830"
Set BorderRadius 10

Hide
Type 'cd /tmp/orphan-files-demo && clear' Enter
Show

Type "# a tiny project: 1 entry point, 1 orphan, and a 2-file island" Sleep 200ms Enter
Type "find src -type f | sort" Sleep 300ms Enter
Wait Sleep 1500ms

Enter Type "# report every file unreachable from any entry point" Sleep 200ms Enter
Type "orphan-files" Sleep 400ms Enter
Wait Sleep 2200ms

Enter Type "# island-a and island-b import each other, yet both are dead" Sleep 200ms Enter
Type "orphan-files --why src/island-a.js" Sleep 400ms Enter
Wait Sleep 1800ms

Enter Type "# a reachable file shows its import chain" Sleep 200ms Enter
Type "orphan-files --why src/math.js" Sleep 400ms Enter
Wait Sleep 1800ms

Sleep 3s
