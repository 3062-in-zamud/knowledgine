# knowledgine CLI Demo
# Record with: vhs docs/assets/demo.tape

Output docs/assets/demo.gif
Set Shell bash
Set FontSize 15
Set Width 900
Set Height 550
Set Theme "Dracula"
Set TypingSpeed 40ms
Set Padding 20

# Title
Type "# knowledgine - Developer Knowledge Infrastructure"
Enter
Sleep 500ms
Type ""
Enter
Sleep 300ms

# Step 1: Initialize with demo notes
Type "knowledgine init --demo --path /tmp/demo"
Enter
Sleep 3s

# Step 2: Search
Type "knowledgine search 'React performance optimization' --path /tmp/demo/knowledgine-demo-notes --format table"
Enter
Sleep 2500ms

# Step 3: Entity graph
Type "knowledgine tool entities --path /tmp/demo/knowledgine-demo-notes --limit 10"
Enter
Sleep 2500ms

# Step 4: Status
Type "knowledgine status --path /tmp/demo/knowledgine-demo-notes"
Enter
Sleep 2500ms

# End
Sleep 1s
