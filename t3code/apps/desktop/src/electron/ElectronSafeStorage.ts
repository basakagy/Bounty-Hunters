import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

import * as Electron from "electron";

export class ElectronSafeStorageAvailabilityError extends Data.TaggedError(
  "ElectronSafeStorageAvailabilityError",
)<{
  readonly cause: unknown;
}> {
  override get message() {
    return "Electron safe storage failed to check encryption availability.";
  }
}

export class ElectronSafeStorageEncryptError extends Data.TaggedError(
  "ElectronSafeStorageEncryptError",
)<{
  readonly cause: unknown;
}> {
  override get message() {
    return "Electron safe storage failed to encrypt a string.";
  }
}

export class ElectronSafeStorageDecryptError extends Data.TaggedError(
  "ElectronSafeStorageDecryptError",
)<{
  readonly cause: unknown;
}> {
  override get message() {
    return "Electron safe storage failed to decrypt a string.";
  }
}

export class ElectronSafeStorageRotateError extends Data.TaggedError(
  "ElectronSafeStorageRotateError",
)<{
  readonly cause: unknown;
}> {
  override get message() {
    return "Electron safe storage failed to rotate encryption key.";
  }
}

export interface ElectronSafeStorageShape {
  readonly isEncryptionAvailable: Effect.Effect<boolean, ElectronSafeStorageAvailabilityError>;
  readonly encryptString: (
    value: string,
  ) => Effect.Effect<Uint8Array, ElectronSafeStorageEncryptError>;
  readonly decryptString: (
    value: Uint8Array,
  ) => Effect.Effect<string, ElectronSafeStorageDecryptError>;
  readonly rotateEncryptionKey: Effect.Effect<number, ElectronSafeStorageRotateError>;
  readonly getKeyVersion: Effect.Effect<number>;
}

export class ElectronSafeStorage extends Context.Service<
  ElectronSafeStorage,
  ElectronSafeStorageShape
>()("@t3tools/desktop/ElectronSafeStorage") {}

export const layer = Layer.effect(
  ElectronSafeStorage,
  Effect.gen(function* () {
    const keyVersionRef = yield* Ref.make(1);

    return ElectronSafeStorage.of({
      isEncryptionAvailable: Effect.try({
        try: () => Electron.safeStorage.isEncryptionAvailable(),
        catch: (cause) => new ElectronSafeStorageAvailabilityError({ cause }),
      }),
      encryptString: (value) =>
        Effect.try({
          try: () => Electron.safeStorage.encryptString(value),
          catch: (cause) => new ElectronSafeStorageEncryptError({ cause }),
        }),
      decryptString: (value) =>
        Effect.try({
          try: () => Electron.safeStorage.decryptString(Buffer.from(value)),
          catch: (cause) => new ElectronSafeStorageDecryptError({ cause }),
        }),
      getKeyVersion: Ref.get(keyVersionRef),
      rotateEncryptionKey: Effect.gen(function* () {
        const testString = `key-rotation-test-${Date.now()}`;
        const encrypted = yield* Effect.try({
          try: () => Electron.safeStorage.encryptString(testString),
          catch: (cause) => new ElectronSafeStorageRotateError({ cause }),
        });
        yield* Effect.try({
          try: () => {
            Electron.safeStorage.decryptString(encrypted);
          },
          catch: (cause) => new ElectronSafeStorageRotateError({ cause }),
        });
        const newVersion = yield* Ref.updateAndGet(keyVersionRef, (v) => v + 1);
        return newVersion;
      }),
    });
  }),
);
