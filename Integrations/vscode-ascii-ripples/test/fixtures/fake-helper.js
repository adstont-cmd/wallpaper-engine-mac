#!/usr/bin/env node
// Stands in for the native trackpad helper: a finger lands, moves, lifts, then waits for stdin to close.
process.stdout.write("d 0.100,0.500\nf 0.120,0.500\nnot a line\nu\n");
process.stdin.resume();
process.stdin.on("end", () => process.exit(0));
