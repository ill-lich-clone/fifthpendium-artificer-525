import test from "node:test";
import assert from "node:assert/strict";
import {
  BLAST_ID, DRONE_ID, DRONE_UUID, FAMILIAR_ID, FREE_SUMMON_ID, MODULE_ID, SLOT_SUMMON_ID,
  buildDrone, buildDroneOverrides, buildHeirloom, vectorDestination
} from "../scripts/mechanus-heirloom-data.mjs";
import {
  applyHeirloomAttack, applyHeirloomDamage, applyHeirloomSaveDC, installMechanusDocuments,
  isTargetMarked, updateMechanusStage
} from "../scripts/mechanus-heirloom.mjs";

test("the world item tracks all six authored stages and only unlocks MK-I at stage five", () => {
  const expected = [
    ["common", 125, 120], ["uncommon", 500, 120], ["uncommon", 1000, 120],
    ["uncommon", 2000, 300], ["rare", 5000, 300], ["rare", 10000, 300]
  ];
  for (const [index, [rarity, price, range]] of expected.entries()) {
    const stage = index + 1;
    const item = buildHeirloom(stage);
    const activities = item.system.activities;
    assert.equal(item.flags[MODULE_ID].heirloomStage, stage);
    assert.equal(item.system.rarity, rarity);
    assert.equal(item.system.price.value, price);
    assert.equal(Number(activities[BLAST_ID].range.value), range);
    assert.equal(activities[BLAST_ID].spell.ability, "int");
    assert.equal(Boolean(activities[FAMILIAR_ID]), stage >= 5);
    if (stage < 5) continue;
    for (const id of [FAMILIAR_ID, FREE_SUMMON_ID, SLOT_SUMMON_ID]) {
      assert.deepEqual(activities[id].profiles.map(p => p.uuid), [DRONE_UUID]);
    }
    assert.deepEqual(activities[FAMILIAR_ID].activation, { type: "minute", value: 1 });
    assert.deepEqual(activities[FAMILIAR_ID].consumption.targets, []);
    assert.equal(activities[FREE_SUMMON_ID].uses.recovery[0].period, "lr");
    assert.equal(activities[SLOT_SUMMON_ID].consumption.targets[0].type, "spellSlots");
  }
  assert.throws(() => buildHeirloom(7), RangeError);
});

function heirloom(stage) {
  return { type: "equipment", getFlag: (namespace, key) => key === "heirloomStage" ? stage : undefined };
}

function spellActivity(stage, { blast = true, classIdentifier = "" } = {}) {
  const gear = heirloom(stage);
  return {
    type: "attack", actionType: "rsak",
    actor: {
      system: { abilities: { int: { mod: 4 } } },
      identifiedItems: new Map([["equipment:mechanus-heirloom", [gear]]])
    },
    item: { type: "spell", system: {
      identifier: blast ? "eldritch-blast" : "fire-bolt",
      linkedActivity: blast ? { item: gear } : undefined,
      classIdentifier
    } }
  };
}

test("each Eldritch Blast damage roll adds INT from stage two and the single core bonus", () => {
  for (const [index, [attack, damage]] of [[0, 0], [0, 4], [1, 5], [1, 5], [1, 5], [2, 6]].entries()) {
    const subject = spellActivity(index + 1);
    const attackRoll = { subject, rolls: [{ parts: ["@prof", "@mod"] }] };
    applyHeirloomAttack(attackRoll);
    assert.deepEqual(attackRoll.rolls[0].parts, ["@prof", "@mod", ...(attack ? [String(attack)] : [])]);
    for (let beam = 0; beam < 2; beam++) {
      const damageRoll = { subject, rolls: [{ parts: ["1d10"], options: { type: "force" } }] };
      applyHeirloomDamage(damageRoll);
      assert.deepEqual(damageRoll.rolls[0].parts, ["1d10", ...(damage ? [String(damage)] : [])]);
    }
  }
});

test("the core applies to artificer attacks and save cards only", () => {
  const artificer = spellActivity(6, { blast: false, classIdentifier: "artificer" });
  const wizard = spellActivity(6, { blast: false, classIdentifier: "wizard" });
  const damage = { subject: artificer, rolls: [{ parts: ["2d10"] }, { parts: ["1d6"] }] };
  applyHeirloomDamage(damage);
  assert.deepEqual(damage.rolls.map(roll => roll.parts), [["2d10", "2"], ["1d6"]]);
  for (const [activity, dc] of [[artificer, 17], [wizard, 15]]) {
    const message = { data: { system: { buttons: [{ action: "rollSave", dataset: { dc: 15, ability: "dex" }, label: {} }] } } };
    applyHeirloomSaveDC(activity, message, { i18n: { format: (key, fields) => String(fields.dc) } });
    assert.equal(message.data.system.buttons[0].dataset.dc, dc);
  }
});

test("summoned MK-I inherits the caster's full proficiency and artificer class level", () => {
  const drone = buildDrone();
  assert.equal(drone._id, DRONE_ID);
  assert.equal(drone.prototypeToken.actorLink, false);
  assert.equal(drone.system.attributes.senses.darkvision, 60);
  assert.deepEqual(drone.system.traits.di.value, ["poison"]);
  assert.deepEqual(drone.system.traits.ci.value, ["frightened", "exhaustion", "poisoned", "charmed"]);
  const update = buildDroneOverrides({
    classes: { artificer: { levels: 5 } },
    attributes: { prof: 4 },
    abilities: { int: { value: 18 }, wis: { value: 12 }, cha: { value: 8 } }
  }, { value: ["common"], custom: "Гномий" });
  assert.deepEqual(update.system.attributes, { ac: { override: 20 }, hp: { value: 30, max: 30, formula: "5d6" } });
  assert.deepEqual(update.system.abilities, { int: { value: 18 }, wis: { value: 12 }, cha: { value: 8 } });
  assert.deepEqual(update.system.skills, {
    arc: { ability: "int", value: 1 },
    prc: { ability: "wis", value: 2 },
    ste: { ability: "dex", value: 2 }
  });
  assert.deepEqual(update.system.traits.languages, { value: ["common"], custom: "Модронский; Гномий" });
});

test("a mark applies to one token until the start of the drone's next turn", () => {
  const mark = { target: "Scene.one.Token.target", combat: "one", round: 4, turn: 2 };
  assert.equal(isTargetMarked(mark, mark.target, { id: "one", round: 4, turn: 1 }), true);
  assert.equal(isTargetMarked(mark, mark.target, { id: "one", round: 4, turn: 2 }), false);
  assert.equal(isTargetMarked(mark, "Scene.one.Token.another", { id: "one", round: 3, turn: 2 }), false);
});

test("vector control moves the target in a straight line and stops a pull at the caster", () => {
  const caster = { x: 100, y: 100 };
  const target = { x: 200, y: 100 };
  assert.deepEqual(vectorDestination(caster, target, 5, false), { x: 400, y: 100 });
  assert.deepEqual(vectorDestination(caster, target, 5, true), caster);
  assert.deepEqual(vectorDestination(caster, target, 20, true), { x: 150, y: 100 });
  assert.equal(vectorDestination(caster, target, 0, true), undefined);
});

test("the GM installer uses stable world IDs and preserves existing records on rerun", async () => {
  const actors = new Map();
  const items = new Map();
  const creations = [];
  const create = collection => async (source, options) => {
    assert.equal(options.keepId, true);
    creations.push(source._id);
    const doc = { ...source, id: source._id };
    collection.set(doc.id, doc);
    return doc;
  };
  const game = { world: { id: "testovyj3" }, system: { id: "dnd5e" }, user: { isGM: true }, actors, items };
  const options = { game, ActorClass: { create: create(actors) }, ItemClass: { create: create(items) } };
  const first = await installMechanusDocuments(options);
  first.item.name = "Моё имя";
  assert.equal((await installMechanusDocuments(options)).item.name, "Моё имя");
  assert.equal(creations.length, 2);
  assert.equal(await installMechanusDocuments({ ...options, game: { ...game, user: { isGM: false } } }), undefined);
});

test("changing stage preserves a spent emergency summon and current equipment name", async () => {
  const source = buildHeirloom(5);
  const updates = [];
  const item = {
    ...source, getFlag: (ns, key) => source.flags[ns][key],
    update: data => updates.push(data)
  };
  await updateMechanusStage(item, 6, { isGM: true });
  assert.equal(updates[0]["flags.fifthpendium-artificer-525.heirloomStage"], 6);
  assert.equal(updates[0].name, undefined);
  assert.equal(updates[0][`system.activities.${FREE_SUMMON_ID}`], undefined);
});

test("Midi-QOL save override is scoped to one workflow and is restored afterward", async () => {
  const handlers = new Map();
  globalThis.Hooks = { on: (name, handler) => handlers.set(name, handler), once: () => {} };
  try {
    await import("../scripts/mechanus-heirloom.mjs?test-hooks");
  } finally {
    delete globalThis.Hooks;
  }
  const activity = {
    ...spellActivity(6, { blast: false, classIdentifier: "artificer" }),
    save: { dc: { value: 15 } }
  };
  const workflow = Object.create({ get saveActivity() { return activity; } });
  const otherWorkflow = Object.create({ get saveActivity() { return activity; } });
  const prepare = handlers.get("midi-qol.preCheckSaves");
  prepare(workflow);
  prepare(workflow);
  assert.equal(workflow.saveActivity.save.dc.value, 17);
  assert.equal(otherWorkflow.saveActivity.save.dc.value, 15);
  handlers.get("midi-qol.postCheckSaves")(workflow);
  assert.equal(workflow.saveActivity, activity);
});
