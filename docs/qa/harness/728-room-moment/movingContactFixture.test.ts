import{it,expect}from'vitest'
import{movingContactCommands,commandFingerprint,MOVING_CONTACT_DABS}from'./movingContactFixture'
it('moving controlled tape exercises caps and ribbons with pressure release',()=>{const commands=movingContactCommands(true);expect(commands.some(c=>c.kind==='stamp')).toBe(true);expect(commands.some(c=>c.kind==='ribbon')).toBe(true);expect(MOVING_CONTACT_DABS.at(-1)?.pressure).toBe(0);expect(commands.some(c=>c.phase==='coverage')).toBe(true);expect(commands.some(c=>c.phase==='pigment')).toBe(true)})
it('same CPU delivery is independent of combined vs retained segmentation',()=>expect(commandFingerprint(movingContactCommands(true))).toBe(commandFingerprint(movingContactCommands(false))))
