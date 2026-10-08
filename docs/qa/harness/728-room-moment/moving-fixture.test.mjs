import test from 'node:test'
import assert from 'node:assert/strict'
import {movingFixture,assertMovingFixture} from './moving-fixture.mjs'
test('four few-contact strokes with real directional drag and bound margins',()=>{assert.equal(assertMovingFixture(),movingFixture);const outside=structuredClone(movingFixture);outside[0].points[0][0]=900;assert.throws(()=>assertMovingFixture(outside));const held=structuredClone(movingFixture);held[3].points=[[400,400],[400,400]];assert.throws(()=>assertMovingFixture(held))})
