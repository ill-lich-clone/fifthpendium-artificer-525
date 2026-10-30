import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCannonActivityUpdate,
  mergeCannonItemUpdate
} from "../scripts/artillerist-cannon.mjs";

test("level 3 cannon uses artificer attack, save, Protector, and action economy", () => {
  const update = buildCannonActivityUpdate({
    intelligenceModifier: 4,
    proficiencyBonus: 2,
    artificerLevel: 3
  });

  assert.equal(update["system.activities.rSrI48kh4nwmWOwf.attack.flat"], true);
  assert.equal(update["system.activities.rSrI48kh4nwmWOwf.attack.bonus"], "6");
  assert.equal(update["system.activities.N0kysnpdVPlD3IkB.save.dc.calculation"], "");
  assert.equal(update["system.activities.N0kysnpdVPlD3IkB.save.dc.formula"], "14");
  assert.equal(update["system.activities.yFMtvzeisfFbPuxk.healing.custom.formula"], "1d8 + 4");

  for (const activityId of ["N0kysnpdVPlD3IkB", "rSrI48kh4nwmWOwf", "yFMtvzeisfFbPuxk"]) {
    assert.equal(update[`system.activities.${activityId}.activation.type`], "bonus");
  }
});

test("level 9 Protector gains the Explosive Cannon die", () => {
  const update = buildCannonActivityUpdate({
    intelligenceModifier: 5,
    proficiencyBonus: 4,
    artificerLevel: 9
  });

  assert.equal(update["system.activities.yFMtvzeisfFbPuxk.healing.custom.formula"], "2d8 + 5");
  assert.equal(update["system.activities.rSrI48kh4nwmWOwf.attack.bonus"], "9");
  assert.equal(update["system.activities.N0kysnpdVPlD3IkB.save.dc.formula"], "17");
});

test("cannon item update merges with dnd5e-generated summon changes", () => {
  const actorUpdates = {
    items: [{ _id: "LlgKlGORoEDFcRk8", effects: [{ _id: "existingEffect" }] }]
  };

  mergeCannonItemUpdate(actorUpdates, {
    _id: "LlgKlGORoEDFcRk8",
    "system.activities.rSrI48kh4nwmWOwf.attack.bonus": "7"
  });

  assert.deepEqual(actorUpdates.items[0].effects, [{ _id: "existingEffect" }]);
  assert.equal(actorUpdates.items[0]["system.activities.rSrI48kh4nwmWOwf.attack.bonus"], "7");
  assert.equal(actorUpdates.items.length, 1);
});

test("direct Protector modifier replaces only the redundant dnd5e summon enchantment", () => {
  const actorUpdates = {
    items: [{
      _id: "LlgKlGORoEDFcRk8",
      effects: [
        { _id: "dnd5eItemChanges", changes: [{ key: "system.damage.bonus", value: "4" }] },
        { _id: "otherModuleEffect", changes: [{ key: "system.properties", value: "mgc" }] }
      ]
    }]
  };

  mergeCannonItemUpdate(actorUpdates, {
    _id: "LlgKlGORoEDFcRk8",
    "system.activities.yFMtvzeisfFbPuxk.healing.custom.formula": "1d8 + 4"
  });

  assert.deepEqual(actorUpdates.items[0].effects, [
    { _id: "otherModuleEffect", changes: [{ key: "system.properties", value: "mgc" }] }
  ]);
});
