const CANNON_ACTOR_UUID =
  "Compendium.fifthpendium-artificer-525.creatures.Actor.QVylQx3S1C6DVTUM";
const CANNON_ACTION_ITEM_ID = "LlgKlGORoEDFcRk8";
const FLAMETHROWER_ACTIVITY_ID = "N0kysnpdVPlD3IkB";
const FORCE_BALLISTA_ACTIVITY_ID = "rSrI48kh4nwmWOwf";
const PROTECTOR_ACTIVITY_ID = "yFMtvzeisfFbPuxk";

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function buildCannonActivityUpdate({
  intelligenceModifier,
  proficiencyBonus,
  artificerLevel
}) {
  const intMod = toFiniteNumber(intelligenceModifier);
  const proficiency = toFiniteNumber(proficiencyBonus);
  const level = toFiniteNumber(artificerLevel);
  const attackBonus = intMod + proficiency;
  const saveDC = 8 + attackBonus;
  const protectorDice = level >= 9 ? 2 : 1;

  return {
    _id: CANNON_ACTION_ITEM_ID,
    [`system.activities.${FLAMETHROWER_ACTIVITY_ID}.activation.type`]: "bonus",
    [`system.activities.${FLAMETHROWER_ACTIVITY_ID}.save.dc.calculation`]: "",
    [`system.activities.${FLAMETHROWER_ACTIVITY_ID}.save.dc.formula`]: String(saveDC),
    [`system.activities.${FORCE_BALLISTA_ACTIVITY_ID}.activation.type`]: "bonus",
    [`system.activities.${FORCE_BALLISTA_ACTIVITY_ID}.attack.flat`]: true,
    [`system.activities.${FORCE_BALLISTA_ACTIVITY_ID}.attack.bonus`]: String(attackBonus),
    [`system.activities.${PROTECTOR_ACTIVITY_ID}.activation.type`]: "bonus",
    [`system.activities.${PROTECTOR_ACTIVITY_ID}.healing.custom.formula`]: `${protectorDice}d8 + ${intMod}`
  };
}

export function mergeCannonItemUpdate(actorUpdates, itemUpdate) {
  actorUpdates.items ??= [];
  const existing = actorUpdates.items.find(item => item._id === CANNON_ACTION_ITEM_ID);

  if (existing) {
    if (Array.isArray(existing.effects)) {
      existing.effects = existing.effects.filter(effect => effect._id !== "dnd5eItemChanges");
    }
    Object.assign(existing, itemUpdate);
  }
  else actorUpdates.items.push(itemUpdate);

  return actorUpdates;
}

function isCannonSummon(profile) {
  return profile?.uuid === CANNON_ACTOR_UUID;
}

function getArtificerLevel(activity, rollData) {
  return rollData?.classes?.artificer?.levels
    ?? activity?.actor?.classes?.artificer?.system?.levels
    ?? activity?.relevantLevel
    ?? 0;
}

export function applyCannonSummonOverrides(activity, profile, config) {
  if (!isCannonSummon(profile) || !config?.actorUpdates) return false;

  const rollData = activity?.actor?.getRollData?.() ?? {};
  const update = buildCannonActivityUpdate({
    intelligenceModifier: rollData.abilities?.int?.mod,
    proficiencyBonus: rollData.attributes?.prof,
    artificerLevel: getArtificerLevel(activity, rollData)
  });

  mergeCannonItemUpdate(config.actorUpdates, update);
  return true;
}

export function cannonRecoveryDefault(item) {
  const uses = item?.system?.uses;
  if (item?.type !== "feat" || !Number(uses?.max) || uses.recovery?.length) return undefined;
  const freeSummon = Array.from(item.system.activities ?? []).some(activity =>
    activity.type === "summon" && activity.profiles?.some(isCannonSummon) &&
    activity.consumption?.targets?.some(target => target.type === "itemUses" && !target.target));
  return freeSummon ? [{ period: "lr", type: "recoverAll" }] : undefined;
}

async function migrateCannonRecovery() {
  if (game.system.id !== "dnd5e" || !game.user.isGM) return;
  const activeGM = game.users.activeGM;
  if (activeGM && activeGM.id !== game.user.id) return;

  const actorUpdates = Array.from(game.actors, async actor => {
    const items = [];
    for (const item of actor.items) {
      const recovery = cannonRecoveryDefault(item);
      if (recovery) items.push({ _id: item.id, "system.uses.recovery": recovery });
    }
    if (items.length) await actor.updateEmbeddedDocuments("Item", items);
  });
  await Promise.all(actorUpdates);
}

globalThis.Hooks?.on("dnd5e.preSummonToken", (activity, profile, config) => {
  applyCannonSummonOverrides(activity, profile, config);
});
globalThis.Hooks?.on("preCreateItem", item => {
  const recovery = cannonRecoveryDefault(item);
  if (recovery) item.updateSource({ "system.uses.recovery": recovery });
});
globalThis.Hooks?.once("ready", () => {
  migrateCannonRecovery().catch(error => console.error("Artificer 2024 | Cannon recovery migration failed.", error));
});
