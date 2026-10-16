#!/usr/bin/env node
// Stands in for the native trackpad helper: after the test's clients connect, a finger
// lands, moves and lifts; then it waits for stdin to close.
setTimeout(() => process.stdout.write("d 0.100,0.500\nf 0.120,0.500\nnot a line\nu\n"), 300);
process.stdin.resume();
process.stdin.on("end", () => process.exit(0));
