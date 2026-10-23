if (!profile.normalizeDeposit || ribbonScratch) {
      yield* this._ribbonStrokeWork(target, dabs, preset, presetName, profile, color, scratch, prevDab ?? chunk?.prevDab, wetProfile, strokeSeed, !!ribbonScratch, pieceTris);
    } else {
      const groups = [];
      let start = 0, distance = 0;
      let previous = prevDab ?? chunk?.prevDab;
      for (let i = 0; i < dabs.length; i++) {
        const d = dabs[i];
        if (previous) distance += Math.hypot(d.x - previous.x, d.y - previous.y);
        previous = d;
        const radius = Math.max(1, d.size * 0.5 * preset.sizeMultiplier);
        if (distance >= radius * 2) { groups.push([start, i + 1]); start = i + 1; distance = 0; }
      }
      if (start < dabs.length) groups.push([start, dabs.length]);
      const maxGroups = globalThis.__wcCausalGroupMax ?? 24;
      if (groups.length > maxGroups) throw Error('Causal prototype budget: ' + groups.length + ' groups exceeds ' + maxGroups);
      globalThis.__wcCausalTrace = [];
      const standingAll = new Map();
      let bridge = prevDab ?? chunk?.prevDab;
      for (const [lo, hi] of groups) {
        const part = dabs.slice(lo, hi);
        const wetPart = wetProfile === undefined ? undefined : wetProfile.slice(lo, hi);
        yield* this._ribbonStrokeWork(target, part, preset, presetName, profile, color, scratch, bridge, wetPart, strokeSeed, false, pieceTris);
        for (const [dab, value] of scratch.standing) standingAll.set(dab, value);
        const before = scratch.brushTravel.length;
        this._finishRibbonStroke(scratch, false, false, false);
        if (this._settle) this._completeSettle();
        globalThis.__wcCausalTrace.push({lo, hi, contacts: before, diffusePending: scratch.diffusePending, gesture: scratch.gesture});
        scratch.newFilm();
        bridge = part[part.length - 1] ?? bridge;
      }
      scratch.standing.clear();
      for (const [dab, value] of standingAll) scratch.standing.set(dab, value);
    }
