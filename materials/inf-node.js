// Runs the in-browser engine (assets/inf-live.js) under node and prints its canon as JSON.
// Usage: node materials/inf-node.js <repo>
var path = require("path"), fs = require("fs"), vm = require("vm");
var repo = path.resolve(process.argv[2] || path.join(__dirname, ".."));
var ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(repo, "assets/inf-sample.js"), "utf8"), ctx);
var eng = require(path.join(repo, "assets/inf-live.js"));
console.log(JSON.stringify(eng.canon(ctx.window.INF_SAMPLE), null, 1));
