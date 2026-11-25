#!/usr/bin/env node
// Turns gen_data.mjs output into chat-format training JSONL ({"messages":[system,user,assistant]}), the exact prompt
// `run_eval.mjs --prompt short` scores with. Usage: node to_chat.mjs IN.jsonl OUT.jsonl
import { readFileSync, writeFileSync } from "node:fs";
import { chatMessages } from "./lib/spec.mjs";
const [inp, out] = process.argv.slice(2);
if (!inp || !out) { console.error("usage: node to_chat.mjs IN.jsonl OUT.jsonl"); process.exit(2); }
const rows = readFileSync(inp, "utf8").trim().split("\n").map((l) => JSON.parse(l));
writeFileSync(out, rows.map((x) => JSON.stringify({ id: x.id, messages: chatMessages(x.state, x.request, x.commands) })).join("\n") + "\n");
console.log(`${rows.length} chat examples -> ${out}`);
