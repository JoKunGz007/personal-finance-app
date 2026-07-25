/// <reference lib="webworker" />

// Dedicated entry point for pdf.js's own worker.
//
// It exists so the parser worker can hand pdf.js a real `Worker` through
// `GlobalWorkerOptions.workerPort`. Pointing `workerSrc` at the package path instead
// let the bundler inline pdf.worker.mjs into the parser worker's own chunk, where it
// executed in that global scope, replaced `self.onmessage`, and posted its internal
// protocol messages to the main thread — the parser appeared to answer every PDF with
// an undefined error. A separate entry module is resolved as its own worker chunk, so
// the two never share a scope or a message channel.
//
// The PDF bytes still never leave the worker pair, and this chunk is served
// same-origin, which the strict CSP requires.
import "pdfjs-dist/build/pdf.worker.mjs";

export {};
