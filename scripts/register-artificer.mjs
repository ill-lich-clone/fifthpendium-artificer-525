import "./artillerist-cannon.mjs";
import "./mechanus-heirloom.mjs";

Hooks.once("ready", async () => {
  if (game.system.id === "dnd5e") {
    const spellLists = game.system.registry?.spellLists;
    const register = spellLists?.register;
    if (typeof register !== "function") {
      console.error("Fifthpendium Artificer 5.2.5 | Compatibility error: dnd5e spell-list register function is unavailable.");
      return;
    }
    try {
      await register.call(spellLists, "Compendium.fifthpendium-artificer-525.info.JournalEntry.A2z7WNmLa2w6xuKv.JournalEntryPage.sPlStyvSQ95mKDnp");
    } catch (error) {
      console.error("Fifthpendium Artificer 5.2.5 | Failed to register Artificer spell list.", error);
    }
  }
});
