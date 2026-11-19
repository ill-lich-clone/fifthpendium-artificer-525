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

  const summon = registeredHooks.find(hook => hook.name === "dnd5e.preSummonToken");
  assert.ok(summon, "the entrypoint loaded by Foundry must install the cannon summon override");
  const actorUpdates = { items: [] };
  assert.notEqual(
    summon.callback({}, { uuid: "Actor.notTheCannon" }, { actorUpdates }),
    false,
    "dnd5e treats an explicit false as a veto, so the cannon hook must let other summons proceed"
  );
  assert.deepEqual(actorUpdates, { items: [] });
  assert.equal(
    registeredHooks.some(hook => hook.name === "dnd5e.preRestCompleted"),
    false,
    "the artificer module must not inspect or modify rests"
  );
});
