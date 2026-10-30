import test from "node:test";
import assert from "node:assert/strict";

test("the loaded module entrypoint registers cannon summoning without intercepting rests", async () => {
  const registeredHooks = [];
  globalThis.Hooks = {
    once: (name, callback) => registeredHooks.push({ name, callback, once: true }),
    on: (name, callback) => registeredHooks.push({ name, callback, once: false })
  };

  try {
    await import(`../scripts/register-artificer.mjs?test=${Date.now()}`);
  }
  finally {
    delete globalThis.Hooks;
  }

  assert.ok(
    registeredHooks.some(hook => hook.name === "dnd5e.preSummonToken"),
    "the entrypoint loaded by Foundry must install the cannon summon override"
  );
  assert.equal(
    registeredHooks.some(hook => hook.name === "dnd5e.preRestCompleted"),
    false,
    "the artificer module must not inspect or modify rests"
  );
});
