"""CPU reference for chronological water/pigment exchange (#680).

Experimental, not imported by Grafetto. Arrays hold amounts per equal-area
cell, not colours or opacity. Every face uses one donor fraction for W and P.
"""
from dataclasses import dataclass
import numpy as np


def transport(w, p, qx, qy):
    """Signed, integrated face volumes; closed domain; simultaneous old state."""
    out = np.zeros_like(w)
    out[..., :, :-1] += np.maximum(qx, 0)
    out[..., :, 1:] += np.maximum(-qx, 0)
    out[..., :-1, :] += np.maximum(qy, 0)
    out[..., 1:, :] += np.maximum(-qy, 0)
    scale = np.minimum(1, np.divide(w, out, out=np.ones_like(w), where=out > 0))
    qx = qx * np.where(qx >= 0, scale[..., :, :-1], scale[..., :, 1:])
    qy = qy * np.where(qy >= 0, scale[..., :-1, :], scale[..., 1:, :])
    c = np.divide(p, w, out=np.zeros_like(p), where=w > 0)
    px = qx * np.where(qx >= 0, c[..., :, :-1], c[..., :, 1:])
    py = qy * np.where(qy >= 0, c[..., :-1, :], c[..., 1:, :])
    wn, pn = w.copy(), p.copy()
    for value, fx, fy in [(wn, qx, qy), (pn, px, py)]:
        value[..., :, :-1] -= fx
        value[..., :, 1:] += fx
        value[..., :-1, :] -= fy
        value[..., 1:, :] += fy
    return wn, pn


@dataclass(frozen=True)
class Params:
    flow: float = 18
    brush_drag: float = .22
    brush_release: float = 9
    brush_exchange: float = 6
    paper_relief: float = .018
    absorb: float = .08
    evaporation: float = .016
    settle: float = .045
    lift: float = .25
    diffusion: float = .12
    breach: float = .35
    pigment_release: float = .6


@dataclass
class Brush:
    water: float
    pigment: float
    capacity: float
    loaded_pigment: float = 0.


class Carrier:
    def __init__(self, paper, params=Params(), pigments=None):
        self.paper = np.asarray(paper, dtype=np.float64)
        self.params = params
        self.w = np.zeros_like(self.paper)
        self.s = np.zeros_like(self.paper)
        pigment_shape = self.paper.shape if pigments is None else (pigments, *self.paper.shape)
        self.p = np.zeros(pigment_shape, dtype=np.float64)
        self.d = np.zeros_like(self.p)
        self.pin = np.zeros_like(self.paper, dtype=bool)
        self.evaporated = 0.
        self.steps = 0

    def totals(self, brush=None):
        return (float(self.w.sum() + self.s.sum() + self.evaporated) + (brush.water if brush else 0),
                float(self.p.sum() + self.d.sum()) + (float(np.sum(brush.pigment + brush.loaded_pigment)) if brush else 0))

    def exchange(self, brush, contact, dt):
        k = self.params
        # Pickup and return are real transfers, including material inherited
        # from a previous contact. No pigment is invented by mixing.
        pickup = self.w * contact * (1 - np.exp(-k.brush_exchange * dt))
        pc = np.divide(self.p, self.w, out=np.zeros_like(self.p), where=self.w > 0)
        picked_p = pickup * pc
        self.w -= pickup
        self.p -= picked_p
        returned = float(pickup.sum())
        brush.water += returned
        brush.pigment += picked_p.sum(axis=(-2, -1))
        level = min(1., brush.water / max(brush.capacity, 1e-12))
        demand = np.maximum(level - self.w, 0) * contact * (1 - np.exp(-k.brush_release * dt))
        if contact.sum() > 0:
            demand += returned * contact / contact.sum()
        amount = float(demand.sum())
        if amount > 0:
            demand *= min(1., brush.water / amount)
            amount = float(demand.sum())
            colour = brush.pigment / max(brush.water, 1e-12)
            spatial_colour = np.asarray(colour)[..., None, None]
            self.w += demand
            self.p += demand * spatial_colour
            brush.water -= amount
            brush.pigment -= amount * colour
        # Pigment retained on the hairs is not a perfectly dissolved dye in
        # the brush reservoir. Contact releases a finite stock independently
        # of the water deficit; picked-up suspended pigment uses the exchange
        # above. This permits a rich initial load followed by diluted returns.
        area = float(contact.sum())
        if area > 0:
            activity = min(1., np.sqrt(area / max(brush.capacity / 7, 1e-12)))
            released = brush.loaded_pigment * (1 - np.exp(-k.pigment_release * dt * activity))
            deposited = np.asarray(released)[..., None, None] * contact / area
            self.p += np.where(self.w > 1e-12, deposited, 0)
            self.d += np.where(self.w > 1e-12, 0, deposited)
            brush.loaded_pigment -= released

    def step(self, dt, contact=None, velocity=(0., 0.), brush=None):
        k = self.params
        if contact is None:
            contact = np.zeros_like(self.w)
        if brush is not None:
            self.exchange(brush, contact, dt)
            self.pin |= contact > .001
        w, p = self.w, self.p
        head = w + k.paper_relief * self.paper
        # Thin films conduct weakly, thick beads readily. The donor limiter
        # makes this explicit Darcy/upwind approximation positive at any dt;
        # its accuracy still depends on resolution and the chosen fixed step.
        mx = np.maximum(w[:, :-1], w[:, 1:])
        my = np.maximum(w[:-1, :], w[1:, :])
        qx = dt * k.flow * mx ** 2 * (head[:, :-1] - head[:, 1:])
        qy = dt * k.flow * my ** 2 * (head[:-1, :] - head[1:, :])
        vx, vy = velocity
        qx += dt * k.brush_drag * vx * .5 * (contact[:, :-1] + contact[:, 1:]) * (w[:, :-1] if vx >= 0 else w[:, 1:])
        qy += dt * k.brush_drag * vy * .5 * (contact[:-1, :] + contact[1:, :]) * (w[:-1, :] if vy >= 0 else w[1:, :])
        # Rough paper pins a thin contact line. A bead can advance it; a
        # vanishing film cannot diffuse indefinitely onto untouched dry paper.
        wet = self.pin | (w > .001) | (self.s > .01)
        recipient_x = np.where(qx >= 0, wet[:, 1:], wet[:, :-1])
        recipient_y = np.where(qy >= 0, wet[1:, :], wet[:-1, :])
        donor_x = np.where(qx >= 0, w[:, :-1], w[:, 1:])
        donor_y = np.where(qy >= 0, w[:-1, :], w[1:, :])
        qx *= recipient_x | (donor_x >= k.breach)
        qy *= recipient_y | (donor_y >= k.breach)
        self.w, self.p = transport(w, p, qx, qy)
        # Brownian mixing transfers pigment down concentration, only across
        # genuinely wet neighbouring cells. Reuse the conservative limiter
        # with P as carrier for this separate symmetric pigment exchange.
        c = np.divide(self.p, self.w, out=np.zeros_like(self.p), where=self.w > 1e-8)
        wetx = np.minimum(self.w[:, :-1], self.w[:, 1:])
        wety = np.minimum(self.w[:-1, :], self.w[1:, :])
        dx = dt * k.diffusion * wetx * (c[..., :, :-1] - c[..., :, 1:])
        dy = dt * k.diffusion * wety * (c[..., :-1, :] - c[..., 1:, :])
        self.p, _ = transport(self.p, self.p, dx, dy)
        lifted = self.d * (1 - np.exp(-dt * k.lift * contact * self.w / (self.w + .03)))
        self.d -= lifted
        self.p += lifted
        settled = self.p * (1 - np.exp(-dt * k.settle * (1 + .75 * (1 - self.paper)) / (self.w + .03)))
        self.p -= settled
        self.d += settled
        capacity = .10 + .10 * (1 - self.paper)
        absorbed = np.minimum(self.w, dt * k.absorb * np.maximum(capacity - self.s, 0))
        self.w -= absorbed
        self.s += absorbed
        wet = self.w > .001
        edge = np.zeros_like(self.w)
        edge[:, :-1] += wet[:, :-1] & ~wet[:, 1:]
        edge[:, 1:] += wet[:, 1:] & ~wet[:, :-1]
        edge[:-1, :] += wet[:-1, :] & ~wet[1:, :]
        edge[1:, :] += wet[1:, :] & ~wet[:-1, :]
        evaporated = np.minimum(self.w, dt * k.evaporation * (1 + edge * .5))
        evaporated_s = np.minimum(self.s, dt * k.evaporation * .2)
        self.w -= evaporated
        self.s -= evaporated_s
        self.evaporated += float(evaporated.sum() + evaporated_s.sum())
        dry = self.w <= 1e-12
        self.d[..., dry] += self.p[..., dry]
        self.p[..., dry] = 0
        self.steps += 1

    def dry_all(self):
        """Terminal bookkeeping only; does not simulate a tideline."""
        self.d += self.p
        self.p.fill(0)
        self.evaporated += float(self.w.sum() + self.s.sum())
        self.w.fill(0)
        self.s.fill(0)
        self.pin.fill(False)


def footprint(shape, x, y, radius, aspect, angle):
    yy, xx = np.indices(shape, dtype=np.float64)
    px, py = xx + .5 - x, yy + .5 - y
    c, s = np.cos(angle), np.sin(angle)
    r2 = ((px * c + py * s) / max(.5, radius * aspect)) ** 2 + ((-px * s + py * c) / max(.5, radius)) ** 2
    # Compact contact, not a painted edge or a ring mask.
    r = np.sqrt(r2)
    edge = np.clip((1 - r) / .15, 0, 1)
    return edge * edge * (3 - 2 * edge)
