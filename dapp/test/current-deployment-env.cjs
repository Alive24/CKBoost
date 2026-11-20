// Reproduce Next's build-time public constant for Jest without loading the
// deployment manager into application runtime imports.
const fs = require("node:fs");
const path = require("node:path");
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "../../deployments.json"), "utf8"));
process.env.NEXT_PUBLIC_CKBOOST_CURRENT_DEPLOYMENTS = JSON.stringify(data.current);
