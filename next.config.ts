import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

/**
 * A build stamp both views can show, so it is obvious which deploy you are
 * looking at. Vercel supplies the commit; locally we ask git, and if that
 * fails the version alone is still better than nothing.
 */
function buildStamp(): string {
  const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as {
    version: string;
  };

  let commit = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
  if (!commit) {
    try {
      commit = execSync("git rev-parse --short HEAD", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      // Not a git checkout; the version carries the message on its own.
    }
  }

  return commit ? `v${version}+${commit.slice(0, 7)}` : `v${version}`;
}

const nextConfig: NextConfig = {
  reactCompiler: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: buildStamp(),
  },
};

export default nextConfig;
