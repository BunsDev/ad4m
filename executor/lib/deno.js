
import "../deno_std-0.177.0/node/util.ts";
import "../deno_std-0.177.0/node/global.ts";
const process = globalThis.process;
const Buffer = globalThis.Buffer;
const setImmediate = globalThis.setImmediate;
const clearImmediate = globalThis.clearImmediate;

import { init as internalInit } from "./main.js"
console.log("Hello from deno.js")
export const init = internalInit