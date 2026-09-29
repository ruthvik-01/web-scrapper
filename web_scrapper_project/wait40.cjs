const fs = require("node:fs");
const start = Date.now();
setTimeout(() => {
  fs.writeFileSync("detached-test.txt", "done at " + (Date.now() - start) + "ms " + new Date().toISOString());
  console.log("detached timer fired");
}, 40000);
fs.writeFileSync("detached-started.txt", "started at " + new Date().toISOString());
