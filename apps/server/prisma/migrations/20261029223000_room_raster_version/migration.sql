-- Pin existing rooms to their existing interpretation. No automatic upgrades.
ALTER TABLE "Room" ADD COLUMN "rasterVersion" TEXT NOT NULL DEFAULT 'legacy-pm8-v1';
ALTER TABLE "Room" ADD CONSTRAINT "Room_rasterVersion_check"
  CHECK ("rasterVersion" IN ('legacy-pm8-v1', 'straight-rgba8-v1'));
