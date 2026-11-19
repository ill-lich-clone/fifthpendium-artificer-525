# Mechanus Heirloom Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** Restore the Artillerist cannon and make a drop-in heirloom and MK-I drone for the Rebreya world.

**Architecture:** Use existing cannon hook and native dnd5e Cast, Summon, and Utility activities. Add focused module hooks for custom rolls and summoned actor data and one idempotent world installer.

**Tech Stack:** Foundry 14.369, dnd5e 6.0.6, native ES modules, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-20-mechanus-heirloom-design.md`.

- [x] Pin and fix the cannon hook's cancellation and multiclass level. Preserve its existing compendium documents, formulas and recovery.
- [x] Test the six stage definitions, spell filtering, per-beam bonus and MK-I stat scaling. Build the world item and actor sources and connect the dnd5e hook callbacks.
- [x] Test idempotent installation and repeatable stage updates. Register a GM-only installer and stage change.
- [x] Run the module's unit tests, syntax and manifest checks. Verify all eight compendiums, the spell list, both summoned actors and long-rest recovery in an isolated Foundry 14.369 / dnd5e 6.0.6 world.
- [ ] Confirm creation of the item and drone in the production world after the GM enables the module.
