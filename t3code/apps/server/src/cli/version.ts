import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import packageJson from "../package.json" with { type: "json" };

const getRuntimeInfo = Effect.sync(() => {
  const runtime = process.versions.bun
    ? `bun ${process.versions.bun}`
    : `node ${process.versions.node ?? "unknown"}`;
  const platform = process.platform;
  const arch = process.arch;
  return { runtime, platform, arch };
});

export const versionCommand = Command.make("version").pipe(
  Command.withDescription("Output version, runtime, platform, and architecture info."),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const info = yield* getRuntimeInfo;
      yield* Console.log(
        `t3code v${packageJson.version} (${info.runtime}, ${info.platform} ${info.arch})`,
      );
    }),
  ),
);
