export const MODULE_ID = "fifthpendium-artificer-525";
export const WORLD_ID = "testovyj3";
export const HEIRLOOM_IDENTIFIER = "mechanus-heirloom";
export const ITEM_ID = "MechanusHeir0001";
export const DRONE_ID = "MechanusDrone001";
export const DRONE_UUID = "Actor." + DRONE_ID;
export const BLAST_ID = "MechEldritch0001";
export const FAMILIAR_ID = "MechFamiliar0001";
export const FREE_SUMMON_ID = "MechEmergFree001";
export const SLOT_SUMMON_ID = "MechEmergSlot001";
export const DRONE_SUMMON_IDS = [FAMILIAR_ID, FREE_SUMMON_ID, SLOT_SUMMON_ID];
export const MARK_ID = "MechTargeting001";

const BLAST_UUID = "Compendium.dnd5e.spells.Item.Z9p1vezIn95jw1Yw";
const HEIRLOOM_IMG = "icons/commodities/gems/gem-faceted-hexagon-blue.webp";
const DRONE_IMG = "icons/creatures/magical/construct-golem-robot-blue.webp";
const STAGES = [
  ["common", 125, 5, "Калиброванный мистический импульс"],
  ["uncommon", 500, 10, "Интеллектуальный заряд"],
  ["uncommon", 1000, 20, "Фокусирующее ядро I"],
  ["uncommon", 2000, 32, "Дальнобойность и векторный контроль"],
  ["rare", 5000, 40, "Автономный дрон Механуса (МК-I)"],
  ["rare", 10000, 80, "Фокусирующее ядро II"]
];
const DRONE_SKILLS = {
  arc: { ability: "int", value: 1 },
  prc: { ability: "wis", value: 2 },
  ste: { ability: "dex", value: 2 }
};

export function getCoreBonus(stage) {
  return stage >= 6 ? 2 : Number(stage >= 3);
}

export function vectorDestination(caster, target, distance, pull) {
  if (!Number.isFinite(distance) || distance <= 0) return undefined;
  const factor = pull ? -Math.min(1, 10 / distance) : 10 / distance;
  return {
    x: target.x + (target.x - caster.x) * factor,
    y: target.y + (target.y - caster.y) * factor
  };
}

function summon(_id, name, sort, activation, range, consumption, uses) {
  return {
    _id, name, sort, type: "summon", activation,
    img: "systems/dnd5e/icons/svg/activity/summon.svg",
    range: { value: String(range), units: "ft", override: true },
    target: { affects: { type: "space", count: "1" }, override: true },
    consumption: { spellSlot: false, targets: consumption },
    profiles: [{ _id: "MechDroneProf001", uuid: DRONE_UUID, count: "1" }],
    match: { disposition: true, proficiency: true },
    ...(uses ? { uses } : {})
  };
}

function buildDescription(stage, coreBonus) {
  const rows = STAGES.map(([, price, days, feature], index) =>
    "<tr><td>" + (index + 1) + "</td><td>" + price + " зм</td><td>" + days +
    " дн.</td><td>" + feature + "</td></tr>").join("");
  const properties = [
    "<p><strong>Ступень " + stage + ".</strong> Мистический заряд считается заговором артефактора, " +
    "не занимает место среди известных заговоров и накладывается с Интеллектом. " +
    "Родовой предмет и Магострельное оружие подходят как фокусировка.</p>"
  ];
  if (stage >= 2) properties.push("<p>К каждому попаданию «Мистическим зарядом» добавляется модификатор Интеллекта.</p>");
  if (coreBonus) properties.push("<p>Фокусирующее ядро даёт +" + coreBonus + " к атакам заклинаниями, " +
    "Сл спасбросков от заклинаний артефактора и урону каждого попадания атакой таким заклинанием.</p>");
  if (stage >= 4) properties.push("<p>Дистанция «Мистического заряда» — 300 футов. При каждом попадании " +
    "можно притянуть или оттолкнуть цель Огромного размера или меньше на 10 футов по прямой.</p>");
  if (stage >= 5) properties.push("<p><strong>Дрон МК-I.</strong> «Поиск фамильяра» всегда подготовлен, " +
    "считается заклинанием артефактора и призывает только @UUID[" + DRONE_UUID + "]{дрона}. " +
    "Накладывается за 1 минуту без ячейки и материалов. Экстренная сборка призывает дрона действием в пределах " +
    "30 футов, бесплатно раз за продолжительный отдых или за ячейку 1-го уровня и выше.</p>" +
    "<p>Дрон делит вашу инициативу и выполняет команды без траты действия. Если вы недееспособны, он защищает вас. " +
    "На одном плане доступны телепатия, его чувства и речь через вокодер. В пределах 100 футов он реакцией " +
    "может передать ваше заклинание касанием.</p>" +
    "<p>Дрон может манипулировать предметами и произносить командные слова. При активации магического или " +
    "хранящего заклинание предмета он может использовать ваш бонус атаки и вашу Сл заклинаний артефактора.</p>");

  return properties.join("") + "<details><summary>Улучшения предмета</summary><table><thead>" +
    "<tr><th>Ступень</th><th>Цена</th><th>Создание</th><th>Свойство</th></tr></thead><tbody>" +
    rows + "</tbody></table></details>";
}

export function buildHeirloom(stage = 1) {
  if (!Number.isInteger(stage) || stage < 1 || stage > STAGES.length) {
    throw new RangeError("Ступень родового предмета должна быть от 1 до 6.");
  }

  const [rarity, price] = STAGES[stage - 1];
  const activities = {
    [BLAST_ID]: {
      _id: BLAST_ID, type: "cast", name: "Мистический заряд", sort: 0,
      range: { value: stage >= 4 ? "300" : "120", units: "ft", override: true },
      spell: { uuid: BLAST_UUID, ability: "int", spellbook: true, properties: [] },
      consumption: { spellSlot: false }
    }
  };
  if (stage >= 5) {
    activities[FAMILIAR_ID] = summon(FAMILIAR_ID, "Поиск фамильяра (дрон МК-I)", 10,
      { type: "minute", value: 1 }, 10, []);
    activities[FREE_SUMMON_ID] = summon(FREE_SUMMON_ID, "Экстренная сборка (бесплатно)", 20,
      { type: "action" }, 30, [{ type: "activityUses", value: "1" }],
      { max: "1", spent: 0, recovery: [{ period: "lr", type: "recoverAll" }] });
    activities[SLOT_SUMMON_ID] = summon(SLOT_SUMMON_ID, "Экстренная сборка (за ячейку)", 30,
      { type: "action" }, 30, [{ type: "spellSlots", target: "1", value: "1", scaling: { mode: "level" } }]);
    activities[SLOT_SUMMON_ID].consumption.scaling = { allowed: true, max: "9" };
  }

  return {
    _id: ITEM_ID,
    name: "Родовой предмет артефактора",
    type: "equipment",
    img: HEIRLOOM_IMG,
    flags: { [MODULE_ID]: { heirloomStage: stage } },
    system: {
      identifier: HEIRLOOM_IDENTIFIER,
      type: { value: "trinket" },
      equipped: true,
      properties: ["mgc", "foc"],
      rarity,
      price: { value: price, denomination: "gp" },
      description: { value: buildDescription(stage, getCoreBonus(stage)) },
      activities
    }
  };
}

export function buildDrone() {
  return {
    _id: DRONE_ID,
    name: "Автономный дрон Механуса (МК-I)",
    type: "npc",
    img: DRONE_IMG,
    flags: { [MODULE_ID]: { mechanusDrone: true } },
    prototypeToken: {
      actorLink: false, disposition: 1, width: 0.5, height: 0.5, texture: { src: DRONE_IMG }
    },
    system: {
      abilities: {
        str: { value: 4 }, dex: { value: 18, proficient: 1 }, con: { value: 16, proficient: 1 },
        int: { value: 10 }, wis: { value: 10, proficient: 1 }, cha: { value: 10 }
      },
      attributes: {
        ac: { override: 18 },
        hp: { value: 10, max: 10, formula: "1d6" },
        movement: { walk: 30, fly: 60, hover: true, units: "ft" },
        senses: { darkvision: 60, units: "ft" },
        spellcasting: "int"
      },
      details: { type: { value: "construct" }, alignment: "Законно-нейтральный", cr: 0 },
      skills: structuredClone(DRONE_SKILLS),
      traits: {
        size: "tiny", di: { value: ["poison"] },
        ci: { value: ["frightened", "exhaustion", "poisoned", "charmed"] },
        languages: { value: [], custom: "Модронский" }
      }
    },
    items: [{
      _id: "MechTraitsFeat01", type: "feat", name: "Автономная конструкция", img: DRONE_IMG,
      system: {
        description: {
          value: "<p>Дрону не нужны воздух, пища, питьё и сон. Магия не может его усыпить. " +
            "Он несёт до 30 фунтов без снижения скорости. «Починка» восстанавливает ему 2к6 хитов.</p>" +
            "<p><strong>Распад и возврат.</strong> При 0 хитов дрон исчезает. Если владелец в пределах 300 футов " +
            "на том же плане, снаряжение оказывается у его ног или в свободной руке. Иначе вещи остаются на месте дрона.</p>"
        }
      }
    }, {
      _id: "MechTargetFeat01", type: "feat", name: "Целеуказание", img: DRONE_IMG,
      system: {
        description: {
          value: "<p>Выберите видимое существо в пределах 120 футов. До начала следующего хода дрона цель " +
            "теряет пользу от невидимости. Владелец дрона совершает атаки «Мистическим зарядом» по цели с преимуществом.</p>"
        },
        activities: {
          [MARK_ID]: {
            _id: MARK_ID, type: "utility", name: "Отметить цель",
            activation: { type: "action" }, range: { value: "120", units: "ft" },
            target: { affects: { type: "creature", count: "1" } }
          }
        }
      }
    }]
  };
}

export function buildDroneOverrides(rollData, ownerLanguages) {
  const level = Number(rollData.classes?.artificer?.levels) || 1;
  const proficiency = Number(rollData.attributes?.prof) || 0;
  const hp = Math.max(10, 6 * level);
  const abilities = Object.fromEntries(["int", "wis", "cha"].map(id =>
    [id, { value: rollData.abilities?.[id]?.value ?? 10 }]));
  return {
    system: {
      attributes: { ac: { override: 16 + proficiency }, hp: { value: hp, max: hp, formula: level + "d6" } },
      abilities,
      skills: structuredClone(DRONE_SKILLS),
      traits: {
        languages: {
          value: [...(ownerLanguages?.value ?? [])],
          custom: ["Модронский", ownerLanguages?.custom].filter(Boolean).join("; ")
        }
      }
    }
  };
}
