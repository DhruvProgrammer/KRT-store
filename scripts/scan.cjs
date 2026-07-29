const fs = require("fs");
const path = require("path");
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const s = fs.statSync(p);
    if (s.isDirectory()) walk(p);
    else if (f.endsWith(".js")) {
      const c = fs.readFileSync(p, "utf8");
      if (/localStorage\.setItem\([\"\']accessToken[\"\']/.test(c)) console.log(p);
    }
  }
}
walk("dist");
console.log("scan complete");
