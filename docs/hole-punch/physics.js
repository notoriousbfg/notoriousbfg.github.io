// the rules of the game, free of any drawing or input, so that the same code
// flies the ship on screen and proves the levels solvable in tests
(function (root) {
    "use strict";

    const WORLD = { width: 1600, height: 900, margin: 240 };

    // the simulation always advances in steps of this size, whatever the frame
    // rate, so a given set of holes always produces the same flight
    const STEP = 1 / 240;
    const PULL = 100000;
    const SOFTENING = 6;
    const SHIP_RADIUS = 7;
    const FLIGHT_LIMIT = 45;

    const MIN_MASS = 8;
    const GROW_RATE = 26; // matter a second while the mouse is held
    const START_CLEARANCE = 70;
    const CLEARANCE = 8;

    // the radius inside which a hole destroys the ship
    function horizonRadius(mass) {
        return 7 + 2.3 * Math.sqrt(mass);
    }

    function massForHorizon(radius) {
        const root = Math.max(radius - 7, 0) / 2.3;
        return root * root;
    }

    // some bodies move: round a circle, or back and forth along a line
    function bodyAt(body, time) {
        if (body.orbit) {
            const angle = 2 * Math.PI * (time / body.orbit.period + (body.orbit.phase || 0));
            return { x: body.orbit.cx + body.orbit.radius * Math.cos(angle), y: body.orbit.cy + body.orbit.radius * Math.sin(angle) };
        }
        if (body.patrol) {
            const swing = 0.5 - 0.5 * Math.cos(2 * Math.PI * (time / body.patrol.period + (body.patrol.phase || 0)));
            return { x: body.x + (body.patrol.x - body.x) * swing, y: body.y + (body.patrol.y - body.y) * swing };
        }
        return body;
    }

    // the station may move too
    function goalAt(level, time) {
        return bodyAt(level.goal, time);
    }

    // a ship with no speed has run out of fuel, and goes nowhere until something pulls it
    function launch(level) {
        const angle = ((level.ship.angle || 0) * Math.PI) / 180;
        const beacons = level.beacons || [];
        return {
            time: 0,
            x: level.ship.x,
            y: level.ship.y,
            vx: Math.cos(angle) * level.ship.speed,
            vy: Math.sin(angle) * level.ship.speed,
            status: "flying",
            cause: null,
            portal: null,
            jumped: null,
            jumps: 0,
            // beacons must all be passed through before the station will take the ship
            passed: beacons.map(() => false),
            left: beacons.length,
            reached: null,
            // how near the ship has come to whatever it needs next: a beacon, or the station
            closest: Infinity
        };
    }

    // the pull on a point from everything that pulls, as a vector
    function pullAt(level, holes, x, y, time) {
        const pull = { x: 0, y: 0 };
        const point = { x: x, y: y };
        for (let i = 0; i < holes.length; i++) pullTowards(point, holes[i].x, holes[i].y, holes[i].mass, pull);
        for (let i = 0; i < level.bodies.length; i++) {
            const body = level.bodies[i];
            if (!body.mass) continue;
            const at = bodyAt(body, time);
            pullTowards(point, at.x, at.y, body.type === "repulsor" ? -body.mass : body.mass, pull);
        }
        return pull;
    }

    // whether a launch would leave the ship sitting where it is: no fuel, and nothing pulling
    function becalmed(level, holes) {
        if (level.ship.speed > 0) return false;
        const pull = pullAt(level, holes, level.ship.x, level.ship.y, 0);
        return pull.x * pull.x + pull.y * pull.y < 1e-6;
    }

    function pullTowards(flight, x, y, mass, pull) {
        const dx = x - flight.x;
        const dy = y - flight.y;
        const distanceSquared = dx * dx + dy * dy;
        const distance = Math.sqrt(distanceSquared) || 1;
        const strength = (PULL * mass) / (distanceSquared + SOFTENING * SOFTENING);
        pull.x += (strength * dx) / distance;
        pull.y += (strength * dy) / distance;
        return distance;
    }

    function end(flight, status, cause) {
        flight.status = status;
        flight.cause = cause || null;
    }

    // advances a flight by one step. `holes` are the player's; everything else
    // comes from the level
    function step(level, holes, flight) {
        if (flight.status !== "flying") return flight;

        const pull = { x: 0, y: 0 };
        const time = flight.time;
        flight.jumped = null;
        flight.reached = null;

        for (let i = 0; i < holes.length; i++) {
            const hole = holes[i];
            if (pullTowards(flight, hole.x, hole.y, hole.mass, pull) < horizonRadius(hole.mass)) {
                end(flight, "imploded", hole);
                return flight;
            }
        }

        for (let i = 0; i < level.bodies.length; i++) {
            const body = level.bodies[i];
            const at = bodyAt(body, time);
            const dx = at.x - flight.x;
            const dy = at.y - flight.y;

            if (body.type === "hole") {
                if (pullTowards(flight, at.x, at.y, body.mass, pull) < horizonRadius(body.mass)) {
                    end(flight, "imploded", body);
                    return flight;
                }
            } else if (body.type === "planet") {
                if (pullTowards(flight, at.x, at.y, body.mass, pull) < body.r + SHIP_RADIUS) {
                    end(flight, "crashed", body);
                    return flight;
                }
            } else if (body.type === "repulsor") {
                if (pullTowards(flight, at.x, at.y, -body.mass, pull) < body.r + SHIP_RADIUS) {
                    end(flight, "crashed", body);
                    return flight;
                }
            } else if (body.type === "asteroid") {
                const reach = body.r + SHIP_RADIUS;
                if (dx * dx + dy * dy < reach * reach) {
                    end(flight, "crashed", body);
                    return flight;
                }
            } else if (body.type === "wormhole") {
                const inside = dx * dx + dy * dy < body.r * body.r;
                if (inside && flight.portal !== body.id) {
                    // out of its twin, keeping speed and heading. the twin stays
                    // shut to the ship until it has flown clear
                    const twin = level.bodies.find((other) => other.type === "wormhole" && other.id === body.twin);
                    const exit = bodyAt(twin, time);
                    flight.x = exit.x;
                    flight.y = exit.y;
                    flight.portal = twin.id;
                    flight.jumped = { from: body, to: twin };
                    flight.jumps++;
                    flight.time += STEP;
                    return flight;
                }
                if (!inside && flight.portal === body.id) flight.portal = null;
            }
        }

        flight.vx += pull.x * STEP;
        flight.vy += pull.y * STEP;
        flight.x += flight.vx * STEP;
        flight.y += flight.vy * STEP;
        flight.time += STEP;

        // beacons first, in any order
        let next = Infinity;
        for (let i = 0; i < flight.passed.length; i++) {
            if (flight.passed[i]) continue;
            const beacon = level.beacons[i];
            const bx = beacon.x - flight.x;
            const by = beacon.y - flight.y;
            const toBeacon = Math.sqrt(bx * bx + by * by);
            if (toBeacon < beacon.r) {
                flight.passed[i] = true;
                flight.left--;
                flight.reached = beacon;
                flight.closest = Infinity;
                next = Infinity;
                break;
            }
            if (toBeacon < next) next = toBeacon;
        }

        const goal = goalAt(level, flight.time);
        const gx = goal.x - flight.x;
        const gy = goal.y - flight.y;
        const toGoal = Math.sqrt(gx * gx + gy * gy);
        if (!flight.left) next = toGoal;
        if (!flight.reached && next < flight.closest) flight.closest = next;

        if (!flight.left && toGoal < level.goal.r) {
            end(flight, "won");
        } else if (
            flight.x < -WORLD.margin ||
            flight.x > WORLD.width + WORLD.margin ||
            flight.y < -WORLD.margin ||
            flight.y > WORLD.height + WORLD.margin
        ) {
            end(flight, "lost");
        } else if (flight.time > FLIGHT_LIMIT) {
            end(flight, "stranded");
        }

        return flight;
    }

    // flies a whole flight at once, for tests and searches
    function fly(level, holes) {
        const flight = launch(level);
        while (flight.status === "flying") step(level, holes, flight);
        return flight;
    }

    // the widest horizon a new hole at (x, y) could have without touching
    // anything, or a negative number if nothing fits there at all
    function roomAt(level, holes, x, y) {
        let room = Math.min(x, y, WORLD.width - x, WORLD.height - y) - CLEARANCE;

        const startX = x - level.ship.x;
        const startY = y - level.ship.y;
        room = Math.min(room, Math.sqrt(startX * startX + startY * startY) - START_CLEARANCE);

        if (!level.goal.orbit && !level.goal.patrol) {
            const goalX = x - level.goal.x;
            const goalY = y - level.goal.y;
            room = Math.min(room, Math.sqrt(goalX * goalX + goalY * goalY) - level.goal.r - CLEARANCE);
        }

        const beacons = level.beacons || [];
        for (let i = 0; i < beacons.length; i++) {
            const dx = x - beacons[i].x;
            const dy = y - beacons[i].y;
            room = Math.min(room, Math.sqrt(dx * dx + dy * dy) - beacons[i].r - CLEARANCE);
        }

        // exclusion zones: rectangles in which no hole may be placed, nor reach into
        const zones = level.zones || [];
        for (let i = 0; i < zones.length; i++) {
            const zone = zones[i];
            const dx = Math.max(zone.x - x, 0, x - (zone.x + zone.w));
            const dy = Math.max(zone.y - y, 0, y - (zone.y + zone.h));
            room = Math.min(room, Math.sqrt(dx * dx + dy * dy) - CLEARANCE);
        }

        for (let i = 0; i < holes.length; i++) {
            const dx = x - holes[i].x;
            const dy = y - holes[i].y;
            room = Math.min(room, Math.sqrt(dx * dx + dy * dy) - horizonRadius(holes[i].mass) - CLEARANCE);
        }

        for (let i = 0; i < level.bodies.length; i++) {
            const body = level.bodies[i];
            if (body.orbit || body.patrol) continue;
            const dx = x - body.x;
            const dy = y - body.y;
            const radius = body.type === "hole" ? horizonRadius(body.mass) : body.r;
            room = Math.min(room, Math.sqrt(dx * dx + dy * dy) - radius - CLEARANCE);
        }

        return room;
    }

    // the most matter a new hole at (x, y) could take, given what is left to
    // spend. zero means no hole can go there
    function capacityAt(level, holes, x, y) {
        if (level.limit && holes.length >= level.limit) return 0;
        const spent = holes.reduce((sum, hole) => sum + hole.mass, 0);
        const left = level.matter - spent;
        const fits = massForHorizon(roomAt(level, holes, x, y));
        const most = Math.min(left, fits);
        return most >= MIN_MASS - 1e-9 ? most : 0;
    }

    // a line of asteroids from one point to another
    function belt(x1, y1, x2, y2, count, r) {
        const rocks = [];
        for (let i = 0; i < count; i++) {
            const along = count === 1 ? 0.5 : i / (count - 1);
            rocks.push({ type: "asteroid", x: x1 + (x2 - x1) * along, y: y1 + (y2 - y1) * along, r: r });
        }
        return rocks;
    }

    // asteroids round part of a circle, `from` and `to` in degrees
    function arc(cx, cy, radius, from, to, count, r) {
        const rocks = [];
        for (let i = 0; i < count; i++) {
            const angle = ((from + ((to - from) * i) / (count - 1)) * Math.PI) / 180;
            rocks.push({ type: "asteroid", x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), r: r });
        }
        return rocks;
    }

    // each level carries an answer for the player who gives up: the fewest holes
    // a search could win it with, then the least matter, and not on a knife edge
    const LEVELS = [
        {
            name: "First light",
            hint: "Press and hold to grow a black hole, then launch. Its pull will bend the ship's course.",
            matter: 40,
            answer: [{ x: 581, y: 496, mass: 8 }],
            ship: { x: 220, y: 640, angle: 0, speed: 150 },
            goal: { x: 1320, y: 240, r: 36 },
            bodies: []
        },
        {
            name: "The rock",
            hint: "Something is in the way. Go around it.",
            matter: 60,
            answer: [{ x: 341, y: 225, mass: 8 }],
            ship: { x: 200, y: 450, angle: 0, speed: 150 },
            goal: { x: 1380, y: 180, r: 36 },
            bodies: belt(800, 400, 800, 700, 6, 30)
        },
        {
            name: "About turn",
            hint: "The station is behind you. A close pass turns the ship hardest, but stray inside a hole and it implodes.",
            matter: 70,
            answer: [{ x: 892, y: 538, mass: 45.9 }],
            ship: { x: 760, y: 300, angle: 0, speed: 150 },
            goal: { x: 300, y: 620, r: 36 },
            bodies: []
        },
        {
            name: "Heavy neighbour",
            hint: "Planets pull too, and they are solid.",
            matter: 60,
            answer: [{ x: 237, y: 148, mass: 19.5 }],
            ship: { x: 160, y: 330, angle: 0, speed: 150 },
            goal: { x: 1380, y: 640, r: 36 },
            bodies: [{ type: "planet", x: 800, y: 450, r: 64, mass: 45 }]
        },
        {
            name: "Slalom",
            hint: "One hole can hand the ship on to the next.",
            matter: 100,
            answer: [{ x: 181, y: 522, mass: 16.9 }, { x: 1241, y: 352, mass: 27.8 }],
            ship: { x: 160, y: 720, angle: 0, speed: 150 },
            goal: { x: 1420, y: 720, r: 36 },
            bodies: belt(560, 20, 560, 500, 9, 30).concat(belt(1040, 400, 1040, 880, 9, 30))
        },
        {
            name: "Sleeping giant",
            hint: "That hole was here before you, and it is hungry. You cannot remove it.",
            matter: 60,
            answer: [{ x: 392, y: 316, mass: 25.9 }],
            ship: { x: 160, y: 450, angle: 0, speed: 150 },
            goal: { x: 1460, y: 450, r: 36 },
            bodies: [{ type: "hole", x: 820, y: 480, mass: 90 }]
        },
        {
            name: "Traffic",
            hint: "Some rocks will not sit still. A longer way round arrives later.",
            matter: 80,
            answer: [{ x: 1271, y: 384, mass: 8 }],
            ship: { x: 160, y: 450, angle: 0, speed: 150 },
            goal: { x: 1440, y: 200, r: 36 },
            bodies: belt(700, 20, 700, 290, 5, 34)
                .concat(belt(700, 610, 700, 880, 5, 34))
                .concat([
                    { type: "asteroid", x: 700, y: 370, r: 34, patrol: { x: 700, y: 530, period: 4 } },
                    { type: "asteroid", x: 1100, y: 300, r: 30, orbit: { cx: 1100, cy: 300, radius: 150, period: 6 } },
                    { type: "asteroid", x: 1100, y: 300, r: 30, orbit: { cx: 1100, cy: 300, radius: 150, period: 6, phase: 0.5 } }
                ])
        },
        {
            name: "Push and pull",
            hint: "A white hole shoves the ship away. Use the shove.",
            matter: 70,
            answer: [{ x: 1247, y: 381, mass: 49.8 }],
            ship: { x: 160, y: 450, angle: 0, speed: 150 },
            goal: { x: 1420, y: 450, r: 36 },
            bodies: [
                { type: "repulsor", x: 1240, y: 450, r: 24, mass: 55 },
                { type: "planet", x: 700, y: 250, r: 50, mass: 30 },
                { type: "planet", x: 700, y: 650, r: 50, mass: 30 }
            ]
        },
        {
            name: "Shortcut",
            hint: "A wormhole spits the ship out of its twin, at the same speed and heading.",
            matter: 80,
            answer: [{ x: 690, y: 611, mass: 26.3 }, { x: 146, y: 343, mass: 20 }],
            ship: { x: 160, y: 220, angle: 0, speed: 150 },
            goal: { x: 1340, y: 400, r: 34 },
            bodies: arc(1280, 330, 200, 0, 345, 24, 30).concat([
                { type: "wormhole", id: "a", twin: "b", x: 560, y: 700, r: 26 },
                { type: "wormhole", id: "b", twin: "a", x: 1180, y: 260, r: 26 }
            ])
        },
        {
            name: "Event horizon",
            hint: "Everything at once.",
            matter: 90,
            answer: [{ x: 440, y: 248, mass: 27 }],
            ship: { x: 160, y: 160, angle: 0, speed: 150 },
            goal: { x: 1400, y: 740, r: 34 },
            bodies: arc(1400, 740, 170, 150, 400, 16, 30).concat([
                { type: "hole", x: 800, y: 450, mass: 110 },
                { type: "wormhole", id: "a", twin: "b", x: 300, y: 720, r: 26 },
                { type: "wormhole", id: "b", twin: "a", x: 1150, y: 200, r: 26 },
                { type: "asteroid", x: 1150, y: 480, r: 30, patrol: { x: 1350, y: 480, period: 5 } }
            ])
        },
        {
            name: "Dead stop",
            hint: "Out of fuel. The ship will not move until something pulls it.",
            matter: 60,
            answer: [{ x: 1047, y: 414, mass: 12.2 }],
            ship: { x: 300, y: 450, speed: 0 },
            goal: { x: 900, y: 450, r: 36 },
            bodies: []
        },
        {
            name: "Sideways",
            hint: "No fuel, and no straight line. Two pulls make a curve.",
            matter: 90,
            answer: [{ x: 521, y: 299, mass: 8 }, { x: 870, y: 348, mass: 29.9 }],
            ship: { x: 250, y: 650, speed: 0 },
            goal: { x: 1250, y: 250, r: 36 },
            bodies: belt(750, 300, 750, 600, 6, 30)
        },
        {
            name: "Checkpoint",
            hint: "The station stays shut until the ship has passed through the beacon.",
            matter: 80,
            answer: [{ x: 968, y: 434, mass: 19.8 }, { x: 55, y: 135, mass: 46.4 }],
            ship: { x: 160, y: 450, angle: 0, speed: 150 },
            goal: { x: 1440, y: 450, r: 36 },
            beacons: [{ x: 800, y: 200, r: 34 }],
            bodies: []
        },
        {
            name: "Keep off",
            hint: "No holes may be placed in the hatched zone.",
            matter: 80,
            answer: [{ x: 1354, y: 253, mass: 22.8 }, { x: 118, y: 329, mass: 10.2 }],
            ship: { x: 160, y: 450, angle: 0, speed: 150 },
            goal: { x: 1440, y: 200, r: 36 },
            zones: [{ x: 420, y: 0, w: 760, h: 900 }],
            bodies: belt(800, 330, 800, 570, 5, 30)
        },
        {
            name: "Catch",
            hint: "The station is on the move. Arrive when it does.",
            matter: 70,
            answer: [{ x: 623, y: 216, mass: 15 }],
            ship: { x: 160, y: 700, angle: 0, speed: 150 },
            goal: { x: 1100, y: 400, r: 30, orbit: { cx: 1100, cy: 400, radius: 220, period: 8 } },
            bodies: [
                { type: "planet", x: 1100, y: 400, r: 50, mass: 40 },
                { type: "asteroid", x: 1100, y: 400, r: 28, orbit: { cx: 1100, cy: 400, radius: 220, period: 8, phase: 1 / 3 } },
                { type: "asteroid", x: 1100, y: 400, r: 28, orbit: { cx: 1100, cy: 400, radius: 220, period: 8, phase: 2 / 3 } }
            ]
        },
        {
            name: "Dead reckoning",
            hint: "No fuel, and a beacon to pass on the way.",
            matter: 110,
            answer: [{ x: 893, y: 659, mass: 45.8 }, { x: 574, y: 708, mass: 12.9 }],
            ship: { x: 200, y: 200, speed: 0 },
            goal: { x: 1300, y: 250, r: 36 },
            beacons: [{ x: 700, y: 650, r: 36 }],
            bodies: []
        },
        {
            name: "Rationed",
            hint: "One hole is all the plotter can hold. Let the planets do the rest.",
            matter: 80,
            limit: 1,
            answer: [{ x: 333, y: 534, mass: 16.7 }],
            ship: { x: 160, y: 450, angle: 0, speed: 150 },
            goal: { x: 1400, y: 700, r: 36 },
            bodies: [{ type: "planet", x: 700, y: 300, r: 55, mass: 50 }, { type: "planet", x: 1050, y: 620, r: 45, mass: 35 }].concat(belt(880, 20, 880, 260, 5, 30))
        },
        {
            name: "Tug",
            hint: "No fuel, and it is already falling.",
            matter: 120,
            answer: [{ x: 1072, y: 219, mass: 45.7 }, { x: 940, y: 360, mass: 45.6 }],
            ship: { x: 560, y: 450, speed: 0 },
            goal: { x: 1300, y: 300, r: 36 },
            bodies: [{ type: "hole", x: 220, y: 450, mass: 45 }]
        },
        {
            name: "Relay",
            hint: "Three rooms, and no door between them. Take them one at a time.",
            matter: 140,
            answer: [{ x: 309, y: 253, mass: 16.8 }, { x: 628, y: 835, mass: 49.7 }],
            ship: { x: 160, y: 160, angle: 0, speed: 150 },
            goal: { x: 1400, y: 700, r: 36 },
            bodies: belt(560, 20, 560, 880, 15, 30)
                .concat(belt(1060, 20, 1060, 880, 15, 30))
                .concat([
                    { type: "wormhole", id: "a", twin: "b", x: 300, y: 700, r: 28 },
                    { type: "wormhole", id: "b", twin: "a", x: 700, y: 200, r: 28 },
                    { type: "wormhole", id: "c", twin: "d", x: 940, y: 700, r: 28 },
                    { type: "wormhole", id: "d", twin: "c", x: 1200, y: 240, r: 28 }
                ])
        },
        {
            name: "Hole punch",
            hint: "No fuel, a beacon, a moving station, and three holes to do it with.",
            matter: 130,
            limit: 3,
            answer: [{ x: 771, y: 320, mass: 100 }],
            ship: { x: 200, y: 750, speed: 0 },
            goal: { x: 800, y: 450, r: 36, orbit: { cx: 800, cy: 450, radius: 260, period: 16 } },
            beacons: [{ x: 1350, y: 200, r: 36 }],
            zones: [{ x: 420, y: 620, w: 500, h: 280 }],
            bodies: [{ type: "hole", x: 800, y: 450, mass: 80 }]
        }
    ];

    root.HolePunch = {
        WORLD: WORLD,
        STEP: STEP,
        SHIP_RADIUS: SHIP_RADIUS,
        FLIGHT_LIMIT: FLIGHT_LIMIT,
        MIN_MASS: MIN_MASS,
        GROW_RATE: GROW_RATE,
        LEVELS: LEVELS,
        horizonRadius: horizonRadius,
        bodyAt: bodyAt,
        goalAt: goalAt,
        becalmed: becalmed,
        launch: launch,
        step: step,
        fly: fly,
        roomAt: roomAt,
        capacityAt: capacityAt,
        belt: belt,
        arc: arc
    };

    if (typeof module !== "undefined") module.exports = root.HolePunch;
})(typeof window !== "undefined" ? window : globalThis);
