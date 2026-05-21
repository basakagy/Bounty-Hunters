import { describe, expect, it, vi } from "vitest";

import {
  createKnownEnvironment,
  detectRuntimeEnvironment,
  getKnownEnvironmentHttpBaseUrl,
  type RuntimeEnvironmentInfo,
} from "./knownEnvironment.ts";

describe("known environment bootstrap helpers", () => {
  it("creates known environments from explicit server base urls", () => {
    expect(
      createKnownEnvironment({
        label: "Remote environment",
        target: {
          httpBaseUrl: "https://remote.example.com",
          wsBaseUrl: "wss://remote.example.com",
        },
      }),
    ).toEqual({
      id: "ws:Remote environment",
      label: "Remote environment",
      source: "manual",
      target: {
        httpBaseUrl: "https://remote.example.com",
        wsBaseUrl: "wss://remote.example.com",
      },
    });
  });

  it("returns the explicit fetchable http origin", () => {
    expect(
      getKnownEnvironmentHttpBaseUrl(
        createKnownEnvironment({
          label: "Local environment",
          target: {
            httpBaseUrl: "http://localhost:3773",
            wsBaseUrl: "ws://localhost:3773",
          },
        }),
      ),
    ).toBe("http://localhost:3773");

    expect(
      getKnownEnvironmentHttpBaseUrl(
        createKnownEnvironment({
          label: "Remote environment",
          target: {
            httpBaseUrl: "https://remote.example.com/api",
            wsBaseUrl: "wss://remote.example.com/api",
          },
        }),
      ),
    ).toBe("https://remote.example.com/api");
  });
});

// ---------------------------------------------------------------------------
// Runtime environment detection tests
// ---------------------------------------------------------------------------

describe("detectRuntimeEnvironment", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reports a known runtime name", () => {
    // In a vitest / Node.js context the runtime should be "node".
    const info = detectRuntimeEnvironment();
    expect(info.runtime).toBe("node");
  });

  it("reports platform and arch from process", () => {
    const info = detectRuntimeEnvironment();
    expect(info.platform).toBe(process.platform);
    expect(info.arch).toBe(process.arch);
  });

  it("detects GitHub Actions CI", () => {
    vi.stubEnv("GITHUB_ACTIONS", "true");
    const info = detectRuntimeEnvironment();
    expect(info.isCI).toBe(true);
    expect(info.ciProvider).toBe("GitHub Actions");
  });

  it("detects GitLab CI", () => {
    vi.stubEnv("GITLAB_CI", "true");
    const info = detectRuntimeEnvironment();
    expect(info.isCI).toBe(true);
    expect(info.ciProvider).toBe("GitLab CI");
  });

  it("detects Jenkins CI", () => {
    vi.stubEnv("JENKINS_URL", "https://jenkins.example.com");
    const info = detectRuntimeEnvironment();
    expect(info.isCI).toBe(true);
    expect(info.ciProvider).toBe("Jenkins");
  });

  it("detects CircleCI", () => {
    vi.stubEnv("CIRCLECI", "true");
    const info = detectRuntimeEnvironment();
    expect(info.isCI).toBe(true);
    expect(info.ciProvider).toBe("CircleCI");
  });

  it("detects Travis CI", () => {
    vi.stubEnv("TRAVIS", "true");
    const info = detectRuntimeEnvironment();
    expect(info.isCI).toBe(true);
    expect(info.ciProvider).toBe("Travis CI");
  });

  it("uses generic CI label when only CI env var is set", () => {
    vi.stubEnv("CI", "true");
    const info = detectRuntimeEnvironment();
    expect(info.isCI).toBe(true);
    expect(info.ciProvider).toBe("generic CI");
  });

  it("reports not in CI when no CI env vars are present", () => {
    // Unset all CI vars that might be set in the test runner itself.
    for (const key of ["CI", "GITHUB_ACTIONS", "GITLAB_CI", "JENKINS_URL", "CIRCLECI", "TRAVIS"]) {
      vi.stubEnv(key, "");
    }
    const info = detectRuntimeEnvironment();
    expect(info.isCI).toBe(false);
    expect(info.ciProvider).toBeNull();
  });

  it("reports not in a container by default (non-Docker test runner)", () => {
    const info = detectRuntimeEnvironment();
    // Most test runners are not inside Docker, so this should be false.
    expect(info.isContainer).toBe(false);
  });

  it("reports not in WSL by default (non-WSL test runner)", () => {
    const info = detectRuntimeEnvironment();
    // On a non-WSL runner this should be false.
    expect(info.isWSL).toBe(false);
  });

  it("returns a complete RuntimeEnvironmentInfo object", () => {
    const info = detectRuntimeEnvironment();
    const keys: Array<keyof RuntimeEnvironmentInfo> = [
      "runtime",
      "platform",
      "arch",
      "isContainer",
      "isCI",
      "ciProvider",
      "isWSL",
    ];
    for (const key of keys) {
      expect(info).toHaveProperty(key);
    }
  });

  it("gracefully handles missing process global (browser-like)", () => {
    const origProcess = globalThis.process;
    // @ts-expect-error simulating browser
    delete globalThis.process;

    const info = detectRuntimeEnvironment();
    expect(info.runtime).toBe("browser");
    expect(info.isContainer).toBe(false);
    expect(info.isCI).toBe(false);
    expect(info.ciProvider).toBeNull();
    expect(info.isWSL).toBe(false);

    globalThis.process = origProcess;
  });
});
