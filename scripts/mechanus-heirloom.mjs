import {
  BLAST_ID, DRONE_ID, DRONE_SUMMON_IDS, DRONE_UUID, HEIRLOOM_IDENTIFIER, ITEM_ID, MARK_ID, MODULE_ID, WORLD_ID,
  buildDrone, buildDroneOverrides, buildHeirloom, getCoreBonus, vectorDestination
} from "./mechanus-heirloom-data.mjs";

function stageOf(item) {
  const stage = item?.type === "equipment" && item.getFlag(MODULE_ID, "heirloomStage");
  return Number.isInteger(stage) && stage >= 1 && stage <= 6 ? stage : 0;
}

function spellHeirloom(activity) {
  const spell = activity?.item;
  if (spell?.type !== "spell") return undefined;
  const linkedItem = spell.system.linkedActivity?.item;
  if (stageOf(linkedItem) && spell.system.identifier === "eldritch-blast") return linkedItem;
  if (spell.system.classIdentifier !== "artificer") return undefined;
  const items = activity.actor?.identifiedItems?.get("equipment:" + HEIRLOOM_IDENTIFIER);
  return Array.from(items ?? []).reduce((best, item) => stageOf(item) > stageOf(best) ? item : best, undefined);
}

export function isTargetMarked(mark, target, combat, now = Date.now()) {
  if (!mark || !target || mark.target !== target) return false;
  if (!mark.combat) return now < mark.expires;
  if (combat?.id !== mark.combat) return false;
  return combat.round < mark.round || (combat.round === mark.round && combat.turn < mark.turn);
}

function selectedTarget(game) {
  const targets = game?.user?.targets;
  return targets?.size === 1 ? targets.values().next().value : undefined;
}

function isSpellAttack(activity) {
  return activity?.type === "attack" && ["msak", "rsak"].includes(activity.actionType);
}

function blastMark(heirloom, activity, target, combat) {
  if (stageOf(heirloom) < 5 || activity.item.system.identifier !== "eldritch-blast") return false;
  return isTargetMarked(heirloom.getFlag(MODULE_ID, "mark"), target?.document?.uuid, combat);
}

function addRollPart(roll, bonus) {
  if (bonus) (roll.parts ??= []).push(String(bonus));
}

export function applyHeirloomAttack(config, game = globalThis.game, message) {
  const { subject, rolls } = config;
  if (!rolls?.length || !isSpellAttack(subject)) return;
  const heirloom = spellHeirloom(subject);
  const stage = stageOf(heirloom);
  if (!stage) return;
  const bonus = getCoreBonus(stage);
  const isBlast = subject.item.system.identifier === "eldritch-blast";
  const advantage = blastMark(heirloom, subject, selectedTarget(game), game?.combat);

  for (const roll of rolls) {
    addRollPart(roll, bonus);
    if (advantage) (roll.options ??= {}).advantage = true;
  }
  if (isBlast && stage >= 4 && message?.data) {
    const caster = subject.getUsageToken()?.uuid;
    if (caster) ((message.data.flags ??= {})[MODULE_ID] ??= {}).vectorCaster = caster;
  }
}

export function applyHeirloomDamage(config) {
  const { subject, rolls } = config;
  if (!rolls?.length || !isSpellAttack(subject)) return;
  const stage = stageOf(spellHeirloom(subject));
  if (!stage) return;
  const blast = subject.item.system.identifier === "eldritch-blast";
  const intelligence = blast && stage >= 2 ? subject.actor.system.abilities.int.mod : 0;
  const roll = blast ? rolls.find(entry => entry.options?.type === "force") ?? rolls[0] : rolls[0];
  addRollPart(roll, intelligence + getCoreBonus(stage));
}

export function applyHeirloomSaveDC(activity, message, game = globalThis.game) {
  const bonus = getCoreBonus(stageOf(spellHeirloom(activity)));
  if (!bonus) return;
  for (const button of message.data?.system?.buttons ?? []) {
    if (button.action !== "rollSave" || !Number.isFinite(button.dataset?.dc)) continue;
    button.dataset.dc += bonus;
    button.label.value = game.i18n.format("DND5E.SavingThrowDC", {
      ability: globalThis.CONFIG?.DND5E.abilities[button.dataset.ability]?.label ?? button.dataset.ability,
      dc: button.dataset.dc
    });
  }
}

function applyMidiMark(workflow) {
  const { activity, attackRollModifierTracker: tracker, targets } = workflow;
  if (!tracker || targets?.size !== 1) return;
  const target = targets.values().next().value;
  if (!blastMark(spellHeirloom(activity), activity, target, game.combat)) return;
  tracker.advantage.add("mechanusTargeting", "Целеуказание Механуса");
  if (!target.actor?.statuses.has("invisible") || !tracker.disadvantage.restore) return;
  const reasons = tracker.attribution.DIS ?? {};
  const invisibility = ["invisible foe"];
  if (workflow.token && !workflow.token.checkCollision(target.center, { type: "sight" })) {
    invisibility.push("Defender not detected");
  }
  const removed = invisibility.filter(reason => Object.hasOwn(reasons, reason));
  if (!removed.length) return;
  const state = tracker.disadvantage.get;
  tracker.disadvantage.restore({ ...state, count: Math.max(0, state.count - removed.length) });
  for (const reason of removed) {
    delete reasons[reason];
    tracker.legacyAttribution.delete("DIS:" + reason);
  }
}

const midiSaveOverrides = new WeakSet();

function applyMidiSaveDC(workflow) {
  const activity = workflow.saveActivity;
  const value = activity?.save?.dc.value;
  if (!Number.isFinite(value) || midiSaveOverrides.has(workflow)) return;
  const bonus = getCoreBonus(stageOf(spellHeirloom(activity)));
  if (!bonus) return;
  const save = { ...activity.save, dc: { ...activity.save.dc, value: value + bonus } };
  // Midi reads saveActivity from the workflow again when it requests saves.
  const adjustedActivity = new Proxy(activity, {
    get(original, key) {
      if (key === "save") return save;
      const property = Reflect.get(original, key, original);
      return typeof property === "function" ? property.bind(original) : property;
    }
  });
  Object.defineProperty(workflow, "saveActivity", { value: adjustedActivity, configurable: true });
  midiSaveOverrides.add(workflow);
}

function restoreMidiSaveDC(workflow) {
  if (midiSaveOverrides.delete(workflow)) delete workflow.saveActivity;
}

function setDroneStats(activity, profile, config) {
  if (profile?.uuid !== DRONE_UUID || !config?.actorUpdates || stageOf(activity.item) < 5) return;
  const overrides = buildDroneOverrides(activity.actor.getRollData(), activity.actor.system.traits.languages);
  foundry.utils.mergeObject(config.actorUpdates, overrides);
}

function isDrone(actor) {
  return actor?.getFlag(MODULE_ID, "mechanusDrone") === true;
}

function droneHeirloom(actor) {
  if (!isDrone(actor)) return undefined;
  const origin = actor.getFlag("dnd5e", "summon.origin");
  return origin ? fromUuidSync(origin) : undefined;
}

function measureDistance(origin, target) {
  if (!origin?.center || !target?.center || origin.document.parent !== target.document.parent) return Infinity;
  return canvas.grid.measurePath([origin.center, target.center]).distance;
}

function renderVectorChoices(message, html) {
  if (message.type !== "attack" || !message.isContentVisible || !isActiveGM(game)) return;
  const casterUuid = message.getFlag(MODULE_ID, "vectorCaster");
  if (!casterUuid) return;
  const caster = fromUuidSync(casterUuid)?.object;
  if (!caster || caster.document.parent !== canvas.scene) return;

  for (const hit of message.system.evaluatedTargets ?? []) {
    if (hit.isMiss) continue;
    const target = fromUuidSync(hit.token)?.object;
    if (!target?.actor || target.document.parent !== canvas.scene || target.actor.system.traits?.size === "grg") continue;
    if (usedVector(message, target)) continue;
    const controls = document.createElement("div");
    controls.className = "flexrow";
    let pending = false;
    for (const [label, pull] of [["Притянуть 10 фт.", true], ["Оттолкнуть 10 фт.", false]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.title = target.name;
      button.addEventListener("click", async () => {
        if (pending || usedVector(message, target)) return;
        pending = true;
        try {
          const distance = measureDistance(caster, target);
          const destination = vectorDestination(caster.center, target.center, distance, pull);
          if (!destination || target.checkCollision(destination)) {
            ui.notifications.warn("Перемещение перекрыто. Если цель может сдвинуться, переместите её вручную.");
            return;
          }
          const doc = target.document;
          const { x, y } = doc;
          await doc.move({
            x: Math.round(x + destination.x - target.center.x),
            y: Math.round(y + destination.y - target.center.y)
          }, { constrainOptions: { ignoreCost: true } });
          if (doc.x === x && doc.y === y) return;
          await message.setFlag(MODULE_ID, "vector." + doc.id, true);
          controls.remove();
        } catch (error) {
          reportError(error);
        } finally {
          pending = false;
        }
      });
      controls.append(button);
    }
    html.querySelector(".message-content")?.append(controls);
  }
}

function usedVector(message, target) {
  return message.getFlag(MODULE_ID, "vector." + target.document.id) === true;
}

async function markForHeirloom(activity) {
  const heirloom = droneHeirloom(activity.actor);
  const target = selectedTarget(game);
  const drone = activity.actor?.token?.object;
  if (stageOf(heirloom) < 5 || !heirloom.isOwner) return;
  if (!target?.actor || target === drone || measureDistance(drone, target) > 120) {
    ui.notifications.warn("Выберите видимое существо в пределах 120 футов от дрона.");
    return;
  }
  const combat = game.combat;
  const turn = combat?.turns.findIndex(entry => entry.tokenId === drone.id) ?? -1;
  const ownerTurn = turn < 0 ? combat?.turns.findIndex(entry => entry.actor?.id === heirloom.actor.id) ?? -1 : turn;
  const mark = { target: target.document.uuid };
  if (combat?.started && ownerTurn >= 0) {
    Object.assign(mark, { combat: combat.id, round: combat.round + Number(combat.turn >= ownerTurn), turn: ownerTurn });
  } else mark.expires = Date.now() + 6000;
  await heirloom.setFlag(MODULE_ID, "mark", mark);
}

async function healDroneAfterMending(activity) {
  if (activity.item?.type !== "spell" || activity.item.system.identifier !== "mending") return;
  const drone = selectedTarget(game)?.actor;
  const hp = drone?.system?.attributes?.hp;
  if (!hp || !isDrone(drone) || !drone.isOwner || hp.value <= 0 || hp.value >= hp.max) return;
  const healing = await new Roll("2d6").evaluate();
  await drone.update({ "system.attributes.hp.value": Math.min(hp.max, hp.value + healing.total) });
  await healing.toMessage({ speaker: ChatMessage.getSpeaker({ actor: drone }), flavor: "Починка дрона Механуса" });
}

function isActiveGM(game) {
  return game.user?.isGM && (!game.users?.activeGM || game.users.activeGM.id === game.user.id);
}

async function syncDroneInitiative(combatant) {
  if (!isActiveGM(game) || !combatant.parent) return;
  const combat = combatant.parent;
  const heirloom = droneHeirloom(combatant.actor);
  if (heirloom) {
    const initiative = combat.combatants.find(entry => entry.actor?.id === heirloom.actor?.id)?.initiative;
    if (Number.isFinite(initiative) && combatant.initiative !== initiative) await combatant.update({ initiative });
    return;
  }
  if (!Number.isFinite(combatant.initiative)) return;
  const updates = combat.combatants.contents.flatMap(entry => {
    if (entry.initiative === combatant.initiative || !isDrone(entry.actor)) return [];
    if (droneHeirloom(entry.actor)?.actor?.id !== combatant.actor?.id) return [];
    return [{ _id: entry.id, initiative: combatant.initiative }];
  });
  if (updates.length) await combat.updateEmbeddedDocuments("Combatant", updates);
}

async function collapseDrone(actor, changes, userId) {
  const hp = changes.system?.attributes?.hp?.value ?? changes["system.attributes.hp.value"];
  if (hp !== 0 || !actor.token || !isDrone(actor)) return;
  if (game.users.activeGM ? !isActiveGM(game) : game.user.id !== userId || !actor.isOwner) return;
  const cargo = actor.items.some(item => !["MechTraitsFeat01", "MechTargetFeat01"].includes(item.id));
  if (cargo) {
    ui.notifications.warn("Дрон распался. Переложите его снаряжение по правилу «Распад и возврат», затем удалите токен.");
    return;
  }
  await actor.token.delete();
}

async function grantDroneOwnership(item) {
  if (!stageOf(item) || !item.actor || !isActiveGM(game)) return;
  const drone = game.actors.get(DRONE_ID);
  const updates = {};
  if (!drone) return;
  for (const [id, level] of Object.entries(item.actor.ownership)) {
    if (id === "default" || level !== CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER || game.users.get(id)?.isGM) continue;
    if (drone.ownership[id] !== level) updates["ownership." + id] = level;
  }
  if (Object.keys(updates).length) await drone.update(updates);
}

let installing;

export async function installMechanusDocuments({
  game = globalThis.game, ActorClass = globalThis.Actor, ItemClass = globalThis.Item
} = {}) {
  if (!game.user?.isGM || game.system?.id !== "dnd5e" || game.world?.id !== WORLD_ID) return undefined;
  if (installing) return installing;
  installing = (async () => {
    const drone = game.actors.get(DRONE_ID) ?? await ActorClass.create(buildDrone(), { keepId: true });
    const item = game.items.get(ITEM_ID) ?? await ItemClass.create(buildHeirloom(), { keepId: true });
    return { item, drone };
  })();
  try {
    return await installing;
  } finally {
    installing = undefined;
  }
}

export async function updateMechanusStage(item, stage, user = globalThis.game?.user) {
  if (!user?.isGM) throw new Error("Ступень родового предмета меняет ГМ.");
  const current = stageOf(item);
  if (!current) throw new Error("Выбранный документ не является родовым предметом Механуса.");
  const { system } = buildHeirloom(stage);
  if (stage === current) return item;
  const updates = {
    ["flags." + MODULE_ID + ".heirloomStage"]: stage,
    "system.rarity": system.rarity,
    "system.price": system.price,
    "system.description.value": system.description.value,
    ["system.activities." + BLAST_ID + ".range.value"]: system.activities[BLAST_ID].range.value
  };
  if (current < 5 && stage >= 5) {
    for (const id of DRONE_SUMMON_IDS) updates["system.activities." + id] = system.activities[id];
  } else if (current >= 5 && stage < 5) {
    for (const id of DRONE_SUMMON_IDS) updates["system.activities.-=" + id] = null;
    updates["flags." + MODULE_ID + ".-=mark"] = null;
  }
  await item.update(updates);

  const cast = item.system.activities.get?.(BLAST_ID);
  const enchantment = cast?.cachedSpell?.effects.get(cast.constructor.ENCHANTMENT_ID);
  if (enchantment && (current >= 4) !== (stage >= 4)) {
    await enchantment.update({ "system.changes": cast.getSpellChanges() });
  }
  return item;
}

function reportError(error) {
  console.error(MODULE_ID + " | Автоматизация Механуса", error);
}

const hooks = globalThis.Hooks;
hooks?.on("dnd5e.preRollAttack", (config, dialog, message) => applyHeirloomAttack(config, game, message));
hooks?.on("dnd5e.preRollDamage", applyHeirloomDamage);
hooks?.on("dnd5e.preCreateUsageMessage", (activity, message) => applyHeirloomSaveDC(activity, message));
hooks?.on("midi-qol.preAttackRollConfig", applyMidiMark);
hooks?.on("midi-qol.preCheckSaves", applyMidiSaveDC);
hooks?.on("midi-qol.postCheckSaves", restoreMidiSaveDC);
hooks?.on("dnd5e.preSummonToken", setDroneStats);
hooks?.on("renderChatMessageHTML", renderVectorChoices);
hooks?.on("dnd5e.postUseActivity", activity => {
  if (activity.id === MARK_ID) markForHeirloom(activity).catch(reportError);
  else healDroneAfterMending(activity).catch(reportError);
});
hooks?.on("createItem", item => grantDroneOwnership(item).catch(reportError));
hooks?.on("createCombatant", combatant => syncDroneInitiative(combatant).catch(reportError));
hooks?.on("updateCombatant", (combatant, changes) => {
  if (Object.hasOwn(changes, "initiative")) syncDroneInitiative(combatant).catch(reportError);
});
hooks?.on("updateActor", (actor, changes, options, userId) => collapseDrone(actor, changes, userId).catch(reportError));
hooks?.once("ready", () => {
  if (game.system.id !== "dnd5e") return;
  const module = game.modules.get(MODULE_ID);
  module.api = {
    ...module.api,
    installMechanusDocuments: () => installMechanusDocuments(),
    async setMechanusStage(itemOrUuid, stage) {
      const item = typeof itemOrUuid === "string" ? await fromUuid(itemOrUuid) : itemOrUuid;
      return updateMechanusStage(item, stage);
    }
  };
  if (isActiveGM(game)) installMechanusDocuments().catch(reportError);
});
