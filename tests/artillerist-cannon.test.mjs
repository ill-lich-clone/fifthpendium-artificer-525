import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCannonSummonOverrides,
  buildCannonActivityUpdate,
  cannonRecoveryDefault,
  mergeCannonItemUpdate
} from "../scripts/artillerist-cannon.mjs";

test("the cannon free use gets a native long-rest recovery only when no recovery was authored", () => {
  const cannon = {
    type: "feat",
    system: {
      uses: { max: "1", spent: 1, recovery: [] },
      activities: [{
        type: "summon",
        profiles: [{ uuid: "Compendium.fifthpendium-artificer-525.creatures.Actor.QVylQx3S1C6DVTUM" }],
        consumption: { targets: [{ type: "itemUses", value: "1", target: "" }] }
      }]
    }
  };
  assert.deepEqual(cannonRecoveryDefault(cannon), [{ period: "lr", type: "recoverAll" }]);
  assert.equal(cannon.system.uses.spent, 1);
  cannon.system.uses.recovery = [{ period: "sr", type: "formula", formula: "1d4" }];
  assert.equal(cannonRecoveryDefault(cannon), undefined);
  cannon.system.uses.recovery = [];
  cannon.system.activities[0].profiles[0].uuid = "Actor.anotherSummon";
  assert.equal(cannonRecoveryDefault(cannon), undefined);
});

test("summoned cannon uses artificer class level on a multiclass character", () => {
  const activity = {
    relevantLevel: 9,
    actor: {
      getRollData: () => ({
        abilities: { int: { mod: 4 } },
        attributes: { prof: 4 },
        classes: { artificer: { levels: 6 } }
      })
    }
  };
  const profile = { uuid: "Compendium.fifthpendium-artificer-525.creatures.Actor.QVylQx3S1C6DVTUM" };
  const config = { actorUpdates: { items: [] } };

  assert.equal(applyCannonSummonOverrides(activity, profile, config), true);
  assert.equal(config.actorUpdates.items[0]["system.activities.yFMtvzeisfFbPuxk.healing.custom.formula"], "1d8 + 4");
});

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
