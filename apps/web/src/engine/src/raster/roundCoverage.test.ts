import { describe, expect, it } from 'vitest';
import { circleBandAlpha, circleDifferenceShouldSkip, prepareCircleDifference } from './roundCoverage';

const circle = (x: number, y: number, radius: number) => ({ x, y, radius });
describe('squared-distance circle coverage reference (not renderer admission)', () => {
    it('keeps the core, truncates the band and excludes the outer boundary', () => {
        expect(circleBandAlpha(2, 0, 2)).toBe(255);
        expect(circleBandAlpha(2, 1, 2)).toBe(204);
        expect(circleBandAlpha(3, 0, 2)).toBe(0);
        expect(circleBandAlpha(3.001, 0, 2)).toBe(0);
        expect(circleBandAlpha(1, 0, .5)).toBe(159);
        expect(circleBandAlpha(.25, 0, .25)).toBe(255);
        expect(circleBandAlpha(0, 0, 0)).toBe(255);
        expect(circleBandAlpha(0, 0, -1)).toBe(0);
        expect(circleBandAlpha(NaN, 0, 1)).toBe(0);
    });
    it('retains full-circle fallback for first, coincident, disjoint and tangent circles', () => {
        for (const previous of [undefined, circle(0, 0, 2), circle(-8, 0, 2), circle(-4, 0, 2), circle(-1.0005, 0, 3)]) {
            const d = prepareCircleDifference(previous, circle(0, 0, 2));
            expect(d.clips).toHaveLength(0);
            expect(circleDifferenceShouldSkip(d, { x: -1, y: 0 })).toBe(false);
        }
    });
    it('clips the back of overlapping equal circles, includes shared plane boundaries', () => {
        const d = prepareCircleDifference(circle(0, 0, 2), circle(1, 0, 2));
        expect(d.clips).toHaveLength(2);
        expect(circleDifferenceShouldSkip(d, { x: 0, y: 0 })).toBe(true);
        expect(circleDifferenceShouldSkip(d, { x: 2, y: 0 })).toBe(false);
        expect(circleDifferenceShouldSkip(d, { x: 3, y: 0 })).toBe(false);
        expect(circleDifferenceShouldSkip(d, { x: 2.5, y: .1 })).toBe(false);
    });
    it('preserves source horizontal changing-radius asymmetry, not ideal circle intersection', () => {
        // d=2, old r=3,new r=2 -> x=2.25; native horizontal quadratic
        // has no roots (x>new r), although ideal circles intersect.
        expect(prepareCircleDifference(circle(0, 0, 3), circle(2, 0, 2)).clips).toHaveLength(0);
        expect(prepareCircleDifference(circle(0, 0, 3), circle(0, 2, 2)).clips).toHaveLength(2);
        expect(prepareCircleDifference(circle(0, 0, 3), circle(2, .0000005, 2)).clips).toHaveLength(0);
        expect(prepareCircleDifference(circle(0, 0, 3), circle(2, .000001, 2)).clips).toHaveLength(2);
    });
    it('handles expanding and shrinking circles without treating their old disc as a subtract mask', () => {
        const growing = prepareCircleDifference(circle(0, 0, 1), circle(2, 0, 2));
        expect(growing.clips).toHaveLength(2);
        expect(circleDifferenceShouldSkip(growing, { x: 3, y: 0 })).toBe(false);
        expect(circleDifferenceShouldSkip(growing, { x: 0, y: 0 })).toBe(true);
        const shrinking = prepareCircleDifference(circle(0, 0, 2), circle(0, 2, 1));
        expect(shrinking.clips).toHaveLength(2);
        expect(circleDifferenceShouldSkip(shrinking, { x: 0, y: 3 })).toBe(false);
        expect(circleDifferenceShouldSkip(shrinking, { x: 0, y: 1 })).toBe(true);
    });
    it('is translation invariant at negative centres and quarter pixel phases', () => {
        const a = prepareCircleDifference(circle(0, 0, 2), circle(1, 0, 2));
        const b = prepareCircleDifference(circle(-10.25, -7.75, 2), circle(-9.25, -7.75, 2));
        for (const x of [-1, 0, 1, 2, 3]) for (const y of [-2, -.5, 0, .5, 2]) {
            expect(circleDifferenceShouldSkip(b, { x: x - 10.25, y: y - 7.75 }))
                .toBe(circleDifferenceShouldSkip(a, { x, y }));
        }
    });
    it('copies preparation inputs so future gesture mutation cannot move its clip', () => {
        const current = circle(1, 0, 2), d = prepareCircleDifference(circle(0, 0, 2), current);
        current.x = 99;
        expect(d.current.x).toBe(1);
        expect(circleDifferenceShouldSkip(d, { x: 0, y: 0 })).toBe(true);
    });
});
