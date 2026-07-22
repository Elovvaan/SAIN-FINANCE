import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function dependencyAvailable(name) {
  try {
    require.resolve(name);
    return true;
  } catch {
    return false;
  }
}

if (!dependencyAvailable("pg")) {
  console.warn("pg is missing from node_modules; installing declared PostgreSQL dependencies before build.");
  execFileSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["install", "--no-audit", "--no-fund", "--include=prod", "pg@^8.16.3", "@types/pg@^8.15.5"],
    { stdio: "inherit" },
  );
}

if (!dependencyAvailable("pg")) {
  throw new Error("POSTGRESQL_BUILD_DEPENDENCY_UNAVAILABLE");
}
