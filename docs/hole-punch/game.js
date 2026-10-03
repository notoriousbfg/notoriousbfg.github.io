// drawing, input and the flow of the game. the rules live in physics.js
(function () {
    "use strict";

    const S = window.HolePunch;
    const WORLD = S.WORLD;
    const LEVELS = S.LEVELS;

    const PREVIEW_SECONDS = 4; // how much of the coming flight is sketched during setup
    const TRAIL_SECONDS = 2.4;
    const PATH_EVERY = 3; // steps between recorded points of a flight
    const ENDING_SECONDS = 1.1;
    // after a win the player's holes eat the whole field: a front spreads out
    // from each, and whatever it reaches spirals in, nearest first
    const FEAST_SECONDS = 3.2;
    const FEAST_FRONT = 1000; // how fast the front spreads, in field units a second
    const FEAST_SWIRL = 1.7; // how far round something turns on its way in, in radians
    const EINSTEIN = 2.4; // the ring that starlight bends round, in horizon radii
    // a press on one of the player's holes moves it once the pointer has travelled
    // this far (in screen pixels); short of that, it selects the hole
    const DRAG_DISTANCE = 6;
    const TOUCH_DRAG_DISTANCE = 14; // a finger wanders more than a mouse
    const TOUCH_REACH = 26; // and needs a bigger target, in screen pixels
    // the pointer carries an unseen hole of this mass, bending the stars under
    // it to show what placing one there would do
    const HOVER_MASS = 26;
    const HOVER_EASE = 0.12; // seconds for the bending to come and go
    // a selected hole wears three controls: more, less and remove. their size and
    // distance from the hole are in screen pixels, so they are the same to press at any zoom
    const CONTROL_RADIUS = 13;
    const TOUCH_CONTROL_RADIUS = 19;
    const CONTROL_GAP = 12;
    const TAP_STEP = 1; // matter added or taken by one tap of a control or an arrow key
    const ADJUST_DELAY = 0.3; // seconds a control is held before it starts to run
    const WHEEL_RATE = 0.02; // matter for each unit the wheel reports
    const TWEAK_SETTLE = 0.5; // seconds of quiet after which wheel or key changes become one undo step
    const DEMO_GROW = 55; // matter a second, when the plotter places the holes itself
    const DEMO_PAUSE = 0.4; // seconds between its holes
    const STAR_COUNT = 520;
    const SCREEN_MARGIN = 14; // clear space kept between the field and the edge of the tube
    // on a small screen the whole field would be too small to play, so the tube
    // shows part of it at this scale and the view is panned about
    const MIN_SCALE = 0.55;
    const PAN_SPEED = 900; // field units a second while an arrow is held
    const PAN_SLACK = 50; // how far past the field's edge the view may look
    const FOLLOW_EASE = 0.22; // seconds for the view to catch up with the ship in flight
    const STORAGE_KEY = "hole-punch.progress";
    const OLD_STORAGE_KEY = "slingshot.progress"; // what the game saved under before it was renamed

    const COLOUR = {
        space: "#05060a",
        ink: "#d7dbe6",
        dim: "#7d8496",
        goal: "#6ff0c8",
        matter: "#f4b860",
        danger: "#ff6b5e",
        fixed: "#ff8a5c",
        wormhole: "#9b7bff",
        beacon: "#ffb43a",
        rock: "#343842",
        rockEdge: "#5b6070"
    };

    const ENDINGS = {
        imploded: "Imploded. The ship strayed inside a black hole.",
        crashed: "Crashed.",
        lost: "Lost in space.",
        stranded: "Stranded. The ship ran out of time."
    };

    const canvas = document.getElementById("field");
    const ctx = canvas.getContext("2d");
    const el = {
        levelNumber: document.getElementById("level-number"),
        levelName: document.getElementById("level-name"),
        matter: document.getElementById("matter"),
        matterFill: document.getElementById("matter-fill"),
        matterLeft: document.getElementById("matter-left"),
        fuel: document.getElementById("fuel"),
        holeCount: document.getElementById("hole-count"),
        lamp: document.getElementById("lamp"),
        undo: document.getElementById("undo"),
        reset: document.getElementById("reset"),
        zoom: document.getElementById("zoom"),
        arrows: {
            left: document.getElementById("pan-left"),
            right: document.getElementById("pan-right"),
            up: document.getElementById("pan-up"),
            down: document.getElementById("pan-down")
        },
        launch: document.getElementById("launch"),
        hint: document.getElementById("hint"),
        won: document.getElementById("won"),
        wonDetail: document.getElementById("won-detail"),
        replay: document.getElementById("replay"),
        next: document.getElementById("next"),
        levels: document.getElementById("levels"),
        levelList: document.getElementById("level-list"),
        levelsOpen: document.getElementById("levels-open"),
        levelsClose: document.getElementById("levels-close"),
        giveUp: document.getElementById("give-up"),
        manual: document.getElementById("manual"),
        manualList: document.getElementById("manual-list"),
        manualOpen: document.getElementById("manual-open"),
        manualClose: document.getElementById("manual-close")
    };

    const view = {
        scale: 1,
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        dpr: 1,
        fit: 1, // the scale at which the whole field fits the tube
        close: true, // whether the player wants the close view, where there is one
        zoomed: false, // whether the close view is showing
        panX: WORLD.width / 2,
        panY: WORLD.height / 2,
        more: { left: false, right: false, up: false, down: false },
        saved: null
    };

    const state = {
        index: 0,
        level: LEVELS[0],
        phase: "setup", // setup, flying, ending, feast, won
        holes: [],
        history: [], // each change to a hole, newest last, for undo
        growing: null,
        pressed: null, // a press on an existing hole: waiting, then dragging if the pointer moves
        selected: null, // the hole whose controls are showing
        adjusting: null, // a control being held
        tweak: null, // a run of wheel or key changes, not yet recorded for undo
        touch: false, // whether the last press or move came from a finger
        panning: null, // the direction an arrow is being held in
        demo: null, // the plotter placing its own holes, after the player gives up
        assisted: false, // whether the holes on the field are the plotter's, not the player's
        hover: null, // where the mouse is over the field, and how strongly it bends the sky
        flight: null,
        path: [],
        ghost: [],
        preview: [],
        ending: null,
        feast: null,
        particles: [],
        refusal: null,
        launches: 0,
        clock: 0,
        alertUntil: 0
    };

    // ---- progress, kept between visits

    function readProgress() {
        try {
            const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || window.localStorage.getItem(OLD_STORAGE_KEY));
            if (saved && typeof saved.unlocked === "number") {
                const best = saved.best || {};
                let unlocked = saved.unlocked;
                // sectors added since the save was made open up if the one before them was cleared
                while (unlocked < LEVELS.length - 1 && best[unlocked] !== undefined) unlocked++;
                return { unlocked: unlocked, best: best, manual: !!saved.manual };
            }
        } catch (e) {}
        return { unlocked: 0, best: {}, manual: false };
    }

    const progress = readProgress();

    function saveProgress() {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
        } catch (e) {}
    }

    // ---- small helpers

    // a repeatable random number generator, so the sky and the rocks look the same every visit
    function seeded(seed) {
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6d2b79f5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function spent() {
        return state.holes.reduce((sum, hole) => sum + hole.mass, 0);
    }

    function flightTime() {
        return state.flight ? state.flight.time : 0;
    }

    function goalNow() {
        return S.goalAt(state.level, flightTime());
    }

    // how many beacons the ship has still to pass before the station opens
    function beaconsLeft() {
        if (state.flight) return state.flight.left;
        return (state.level.beacons || []).length;
    }

    function outOfFuel() {
        return state.level.ship.speed === 0;
    }

    // every hole on the field: the level's own, the player's, and one being grown
    function allHoles() {
        const holes = [];
        const time = flightTime();
        for (const body of state.level.bodies) {
            if (body.type !== "hole") continue;
            const at = S.bodyAt(body, time);
            holes.push({ x: at.x, y: at.y, mass: body.mass, fixed: true });
        }
        for (const hole of state.holes) holes.push(hole);
        return holes;
    }

    // ---- the feast

    // where the feast has taken something that sat at (x, y): pulled round and
    // in towards the nearest of the player's holes, shrinking as it goes
    function feastAt(x, y) {
        let hole = state.holes[0];
        let nearest = Infinity;
        for (const candidate of state.holes) {
            const span = (x - candidate.x) * (x - candidate.x) + (y - candidate.y) * (y - candidate.y);
            if (span < nearest) {
                nearest = span;
                hole = candidate;
            }
        }

        const dx = x - hole.x;
        const dy = y - hole.y;
        const distance = Math.sqrt(nearest);
        const wait = distance / FEAST_FRONT;
        const taken = 0.45 + distance / 1600;
        const progress = Math.min(Math.max((state.feast.age - wait) / taken, 0), 1);
        const gone = progress * progress;
        const left = 1 - gone;
        const turn = FEAST_SWIRL * gone;
        const cos = Math.cos(turn);
        const sin = Math.sin(turn);
        const nx = hole.x + (dx * cos - dy * sin) * left;
        const ny = hole.y + (dx * sin + dy * cos) * left;

        return { x: nx, y: ny, left: left, gone: gone, heading: Math.atan2(hole.y - ny, hole.x - nx) };
    }

    // draws something centred on (x, y) as the feast has left it, if it is still there
    function feasted(x, y, paint) {
        if (!state.feast) {
            paint();
            return;
        }
        const fate = feastAt(x, y);
        if (fate.left < 0.02) return;
        ctx.save();
        ctx.translate(fate.x, fate.y);
        ctx.scale(fate.left, fate.left);
        ctx.translate(-x, -y);
        paint();
        ctx.restore();
    }

    // ---- the sky, bent by every hole

    const stars = (function () {
        const random = seeded(7);
        const list = [];
        for (let i = 0; i < STAR_COUNT; i++) {
            const large = random() < 0.12;
            list.push({
                x: -500 + random() * (WORLD.width + 1000),
                y: -400 + random() * (WORLD.height + 800),
                r: large ? 1.5 + random() * 0.7 : 0.6 + random() * 0.7,
                glow: 0.25 + random() * 0.6,
                pace: 0.4 + random() * 1.2,
                phase: random() * 6.283,
                blue: large
            });
        }
        return list;
    })();

    function drawStars(holes) {
        for (const star of stars) {
            let x = star.x;
            let y = star.y;
            let stretch = 1;
            let angle = 0;

            for (const hole of holes) {
                const dx = star.x - hole.x;
                const dy = star.y - hole.y;
                const ring = S.horizonRadius(hole.mass) * EINSTEIN;
                const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 0.5);
                if (distance > ring * 9) continue;

                // light passing a point mass: a star `distance` from the hole is
                // seen further out, smeared round the ring
                const seen = (distance + Math.sqrt(distance * distance + 4 * ring * ring)) / 2;
                x += ((seen - distance) * dx) / distance;
                y += ((seen - distance) * dy) / distance;

                const smear = Math.min((seen / distance) * (seen / distance), 7);
                if (smear > stretch) {
                    stretch = smear;
                    angle = Math.atan2(dy, dx);
                }
            }

            const twinkle = 0.75 + 0.25 * Math.sin(state.clock * star.pace + star.phase);
            ctx.fillStyle = star.blue ? "#dce7ff" : "#ffffff";

            // once the feast reaches a star it leaves its place and streaks in
            const fate = state.feast ? feastAt(x, y) : null;
            if (fate && fate.gone > 0) {
                if (fate.left < 0.02) continue;
                const streak = 1 + 14 * fate.gone * fate.left;
                ctx.globalAlpha = Math.min(star.glow * (1.2 - fate.gone * fate.gone), 1);
                ctx.beginPath();
                ctx.ellipse(fate.x, fate.y, star.r * streak, star.r * (0.4 + 0.6 * fate.left), fate.heading, 0, 6.2832);
                ctx.fill();
                continue;
            }

            ctx.globalAlpha = Math.min(star.glow * twinkle * (0.8 + 0.2 * stretch), 1);
            ctx.beginPath();
            if (stretch > 1.05) {
                ctx.ellipse(x, y, star.r, star.r * stretch, angle, 0, 6.2832);
            } else {
                ctx.arc(x, y, star.r, 0, 6.2832);
            }
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ---- the things on the field

    function drawField() {
        if (state.feast) ctx.globalAlpha = Math.max(1 - state.feast.age * 2, 0);
        ctx.strokeStyle = "rgba(125, 132, 150, 0.16)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 9]);
        ctx.strokeRect(0, 0, WORLD.width, WORLD.height);
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
    }

    function drawHole(hole, growing) {
        const radius = S.horizonRadius(hole.mass);
        const rim = hole.fixed ? COLOUR.fixed : "#fff1dc";

        const halo = ctx.createRadialGradient(hole.x, hole.y, radius, hole.x, hole.y, radius * 2.3);
        halo.addColorStop(0, hole.fixed ? "rgba(255, 138, 92, 0.22)" : "rgba(255, 241, 220, 0.16)");
        halo.addColorStop(1, "rgba(255, 241, 220, 0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(hole.x, hole.y, radius * 2.3, 0, 6.2832);
        ctx.fill();

        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.arc(hole.x, hole.y, radius, 0, 6.2832);
        ctx.fill();

        ctx.strokeStyle = rim;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.globalAlpha = 1;

        if (hole.fixed) {
            // a turning dashed collar marks a hole that cannot be undone
            ctx.save();
            ctx.translate(hole.x, hole.y);
            ctx.rotate(state.clock * 0.3);
            ctx.strokeStyle = COLOUR.fixed;
            ctx.globalAlpha = 0.5;
            ctx.lineWidth = 1.2;
            ctx.setLineDash([4, 7]);
            ctx.beginPath();
            ctx.arc(0, 0, radius + 7, 0, 6.2832);
            ctx.stroke();
            ctx.restore();
        }

        if (growing) {
            const pulse = radius + 8 + 3 * Math.sin(state.clock * 9);
            ctx.strokeStyle = COLOUR.matter;
            ctx.globalAlpha = 0.8;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(hole.x, hole.y, pulse, 0, 6.2832);
            ctx.stroke();
            ctx.globalAlpha = 1;

            ctx.fillStyle = COLOUR.matter;
            ctx.font = "13px ui-monospace, Menlo, monospace";
            ctx.textAlign = "center";
            // clear of the finger doing the growing
            ctx.fillText(String(Math.round(hole.mass)), hole.x, hole.y - radius - 18 - (state.touch ? 44 / view.scale : 0));
        }
    }

    const rockShapes = new Map();

    // each rock keeps the same lumpy outline, worked out once from where it sits
    function rockShape(body) {
        let shape = rockShapes.get(body);
        if (!shape) {
            const random = seeded(Math.round(body.x * 7 + body.y * 13 + body.r * 31));
            const corners = 9 + Math.floor(random() * 4);
            shape = { spin: (random() - 0.5) * 0.5, points: [] };
            for (let i = 0; i < corners; i++) {
                const angle = (i / corners) * 6.2832;
                const reach = body.r * (0.82 + random() * 0.2);
                shape.points.push([Math.cos(angle) * reach, Math.sin(angle) * reach]);
            }
            rockShapes.set(body, shape);
        }
        return shape;
    }

    function drawTrack(body) {
        ctx.strokeStyle = "rgba(125, 132, 150, 0.22)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 7]);
        ctx.beginPath();
        if (body.orbit) {
            ctx.arc(body.orbit.cx, body.orbit.cy, body.orbit.radius, 0, 6.2832);
        } else {
            ctx.moveTo(body.x, body.y);
            ctx.lineTo(body.patrol.x, body.patrol.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }

    function drawAsteroid(body, at) {
        const shape = rockShape(body);
        ctx.save();
        ctx.translate(at.x, at.y);
        ctx.rotate(shape.spin * state.clock);
        ctx.beginPath();
        ctx.moveTo(shape.points[0][0], shape.points[0][1]);
        for (let i = 1; i < shape.points.length; i++) ctx.lineTo(shape.points[i][0], shape.points[i][1]);
        ctx.closePath();
        ctx.fillStyle = COLOUR.rock;
        ctx.fill();
        ctx.strokeStyle = COLOUR.rockEdge;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
    }

    const PLANET_TINTS = [
        ["#ffd9b8", "#ee8a4e", "#7a2a10"],
        ["#e4f1ff", "#7fa8d8", "#1f3557"],
        ["#fff0cc", "#e0b56a", "#6a4418"]
    ];

    function drawPlanet(body, at, tint) {
        const shade = ctx.createRadialGradient(at.x - body.r * 0.35, at.y - body.r * 0.4, body.r * 0.1, at.x, at.y, body.r * 1.05);
        shade.addColorStop(0, tint[0]);
        shade.addColorStop(0.5, tint[1]);
        shade.addColorStop(1, tint[2]);
        ctx.fillStyle = shade;
        ctx.beginPath();
        ctx.arc(at.x, at.y, body.r, 0, 6.2832);
        ctx.fill();
    }

    function drawRepulsor(body, at) {
        const glow = ctx.createRadialGradient(at.x, at.y, body.r * 0.3, at.x, at.y, body.r * 3);
        glow.addColorStop(0, "rgba(255, 255, 255, 0.5)");
        glow.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(at.x, at.y, body.r * 3, 0, 6.2832);
        ctx.fill();

        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(at.x, at.y, body.r, 0, 6.2832);
        ctx.fill();

        // rings travelling outwards, to say that it pushes
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const travel = (state.clock * 0.5 + i / 3) % 1;
            ctx.globalAlpha = 0.35 * (1 - travel);
            ctx.beginPath();
            ctx.arc(at.x, at.y, body.r * (1.2 + travel * 2.2), 0, 6.2832);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    function drawWormhole(body, at) {
        ctx.save();
        ctx.translate(at.x, at.y);
        ctx.strokeStyle = COLOUR.wormhole;
        ctx.lineWidth = 1.6;
        for (let i = 0; i < 3; i++) {
            const turn = state.clock * (1.2 + i * 0.5) + i * 2;
            ctx.globalAlpha = 0.9 - i * 0.25;
            ctx.beginPath();
            ctx.ellipse(0, 0, body.r * (1 - i * 0.26), body.r * (0.55 - i * 0.12), turn, 0, 6.2832);
            ctx.stroke();
        }
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = COLOUR.wormhole;
        ctx.beginPath();
        ctx.arc(0, 0, body.r, 0, 6.2832);
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
    }

    function drawBodies() {
        const time = flightTime();
        let planets = 0;

        for (const body of state.level.bodies) {
            if ((body.orbit || body.patrol) && !state.feast) drawTrack(body);
        }

        for (const body of state.level.bodies) {
            const at = S.bodyAt(body, time);
            if (body.type === "asteroid") feasted(at.x, at.y, () => drawAsteroid(body, at));
            else if (body.type === "planet") {
                const tint = PLANET_TINTS[planets++ % PLANET_TINTS.length];
                feasted(at.x, at.y, () => drawPlanet(body, at, tint));
            } else if (body.type === "repulsor") feasted(at.x, at.y, () => drawRepulsor(body, at));
            else if (body.type === "wormhole") feasted(at.x, at.y, () => drawWormhole(body, at));
        }
    }

    function drawGoal() {
        const goal = state.level.goal;
        const at = goalNow();
        const burst = state.ending && state.ending.status === "won" ? state.ending.age / ENDING_SECONDS : 0;
        const shut = beaconsLeft() > 0;

        if ((goal.orbit || goal.patrol) && !state.feast) drawTrack(goal);

        ctx.save();
        ctx.translate(at.x, at.y);
        // a station waiting on its beacons is dim, and shows how many are left
        ctx.strokeStyle = shut ? COLOUR.dim : COLOUR.goal;
        ctx.fillStyle = shut ? COLOUR.dim : COLOUR.goal;

        if (shut) {
            ctx.globalAlpha = 0.9;
            ctx.font = "13px ui-monospace, Menlo, monospace";
            ctx.textAlign = "center";
            ctx.fillText(String(beaconsLeft()), 0, -goal.r - 10);
        }

        ctx.globalAlpha = 0.1 + 0.25 * burst;
        ctx.beginPath();
        ctx.arc(0, 0, goal.r, 0, 6.2832);
        ctx.fill();

        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([10, 7]);
        ctx.rotate(state.clock * 0.35);
        ctx.beginPath();
        ctx.arc(0, 0, goal.r, 0, 6.2832);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, 6.2832);
        ctx.fill();

        // a slow beacon, and a brighter one on arrival
        const beat = (state.clock * 0.45) % 1;
        ctx.globalAlpha = shut ? 0 : 0.4 * (1 - beat);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, goal.r * (0.3 + beat * 0.7), 0, 6.2832);
        ctx.stroke();

        if (burst) {
            ctx.globalAlpha = 1 - burst;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, goal.r * (1 + burst * 2.5), 0, 6.2832);
            ctx.stroke();
        }
        ctx.restore();
        ctx.globalAlpha = 1;
    }

    // beacons: amber rings to fly through. one that has been passed goes green and quiet
    function drawBeacons() {
        const beacons = state.level.beacons || [];
        for (let i = 0; i < beacons.length; i++) {
            const beacon = beacons[i];
            const passed = !!state.flight && state.flight.passed[i];
            feasted(beacon.x, beacon.y, function () {
                ctx.save();
                ctx.translate(beacon.x, beacon.y);
                ctx.strokeStyle = passed ? COLOUR.goal : COLOUR.beacon;
                ctx.fillStyle = passed ? COLOUR.goal : COLOUR.beacon;
                ctx.lineWidth = 1.6;

                ctx.globalAlpha = passed ? 0.12 : 0.06;
                ctx.beginPath();
                ctx.arc(0, 0, beacon.r, 0, 6.2832);
                ctx.fill();

                ctx.globalAlpha = passed ? 0.45 : 0.9;
                ctx.beginPath();
                ctx.arc(0, 0, beacon.r, 0, 6.2832);
                ctx.stroke();

                // four ticks, like a gunsight, turning slowly until it is passed
                if (!passed) ctx.rotate(state.clock * 0.5);
                ctx.beginPath();
                for (let tick = 0; tick < 4; tick++) {
                    const angle = (tick * Math.PI) / 2;
                    ctx.moveTo(Math.cos(angle) * (beacon.r - 9), Math.sin(angle) * (beacon.r - 9));
                    ctx.lineTo(Math.cos(angle) * (beacon.r + 7), Math.sin(angle) * (beacon.r + 7));
                }
                ctx.stroke();
                ctx.restore();
                ctx.globalAlpha = 1;
            });
        }
    }

    // exclusion zones: hatched, and bordered in the colour of a refusal
    function drawZones() {
        const zones = state.level.zones || [];
        const fade = state.feast ? Math.max(1 - state.feast.age * 2, 0) : 1;
        if (!fade) return;

        for (const zone of zones) {
            ctx.strokeStyle = COLOUR.danger;
            ctx.lineWidth = 1;

            // diagonal hatching, each line cut to the rectangle by hand
            ctx.globalAlpha = 0.11 * fade;
            ctx.beginPath();
            for (let offset = 28; offset < zone.w + zone.h; offset += 28) {
                const x1 = Math.min(offset, zone.w);
                const y1 = Math.max(offset - zone.w, 0);
                const x2 = Math.max(offset - zone.h, 0);
                const y2 = Math.min(offset, zone.h);
                ctx.moveTo(zone.x + x1, zone.y + y1);
                ctx.lineTo(zone.x + x2, zone.y + y2);
            }
            ctx.stroke();

            ctx.globalAlpha = 0.4 * fade;
            ctx.setLineDash([8, 6]);
            ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);
            ctx.setLineDash([]);
        }
        ctx.globalAlpha = 1;
    }

    function drawShipShape(x, y, heading, scale, alpha) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(heading);
        ctx.scale(scale, scale);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#eef3ff";
        ctx.beginPath();
        ctx.moveTo(11, 0);
        ctx.lineTo(-8, 6.5);
        ctx.lineTo(-4.5, 0);
        ctx.lineTo(-8, -6.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
    }

    // where the ship waits, and which way it will set off
    function drawStart() {
        const ship = state.level.ship;
        const heading = ((ship.angle || 0) * Math.PI) / 180;
        const waiting = state.phase === "setup";
        const dead = outOfFuel();

        ctx.save();
        ctx.translate(ship.x, ship.y);
        ctx.strokeStyle = dead ? COLOUR.danger : COLOUR.dim;
        ctx.globalAlpha = waiting ? (dead ? 0.35 + 0.35 * Math.abs(Math.sin(state.clock * 2.4)) : 0.7) : 0.3;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, 6.2832);
        ctx.stroke();

        // a ship with fuel shows which way it will set off; one without just sits
        if (waiting && !dead) {
            ctx.rotate(heading);
            const nudge = 4 * ((state.clock * 0.8) % 1);
            ctx.setLineDash([3, 5]);
            ctx.beginPath();
            ctx.moveTo(22 + nudge, 0);
            ctx.lineTo(50 + nudge, 0);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(56 + nudge, 0);
            ctx.lineTo(48 + nudge, -4);
            ctx.lineTo(48 + nudge, 4);
            ctx.closePath();
            ctx.fillStyle = COLOUR.dim;
            ctx.fill();
        }
        ctx.restore();
        ctx.globalAlpha = 1;

        if (waiting) drawShipShape(ship.x, ship.y, heading, 1, 1);
    }

    // a flight's recorded path is a list of points, with a null wherever the ship jumped through a wormhole
    function tracePath(points, from) {
        let pen = false;
        ctx.beginPath();
        for (let i = from || 0; i < points.length; i++) {
            const point = points[i];
            if (!point) {
                pen = false;
            } else if (pen) {
                ctx.lineTo(point[0], point[1]);
            } else {
                ctx.moveTo(point[0], point[1]);
                pen = true;
            }
        }
    }

    function drawGhost() {
        if (!state.ghost.length || state.phase !== "setup") return;
        ctx.strokeStyle = COLOUR.dim;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 1;
        tracePath(state.ghost);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    function drawPreview() {
        if (state.phase !== "setup" || state.preview.length < 2) return;
        ctx.strokeStyle = "#eef3ff";
        ctx.lineWidth = 1.4;
        ctx.setLineDash([2, 8]);
        ctx.lineCap = "round";
        ctx.globalAlpha = 0.55;
        tracePath(state.preview);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineCap = "butt";
        ctx.globalAlpha = 1;
    }

    function drawShip() {
        const flight = state.flight;
        if (!flight) return;

        // the tail of the flight so far, fading away behind the ship
        const keep = Math.round(TRAIL_SECONDS / (S.STEP * PATH_EVERY));
        const from = Math.max(state.path.length - keep, 0);
        ctx.lineWidth = 1.6;
        for (let i = from + 1; i < state.path.length && !state.feast; i++) {
            const a = state.path[i - 1];
            const b = state.path[i];
            if (!a || !b) continue;
            ctx.strokeStyle = "#9ec4ff";
            ctx.globalAlpha = 0.6 * ((i - from) / keep);
            ctx.beginPath();
            ctx.moveTo(a[0], a[1]);
            ctx.lineTo(b[0], b[1]);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        const moving = flight.vx * flight.vx + flight.vy * flight.vy > 1;
        const heading = moving ? Math.atan2(flight.vy, flight.vx) : ((state.level.ship.angle || 0) * Math.PI) / 180;
        const ending = state.ending;

        if (!ending) {
            drawShipShape(flight.x, flight.y, heading, 1, 1);
            return;
        }

        const gone = Math.min(ending.age / ENDING_SECONDS, 1);
        if (ending.status === "imploded") {
            // drawn down into the hole, turning as it goes
            const pulled = Math.min(gone * 2.2, 1);
            const x = flight.x + (ending.cause.x - flight.x) * pulled;
            const y = flight.y + (ending.cause.y - flight.y) * pulled;
            drawShipShape(x, y, heading + pulled * 9, 1 - pulled, 1);
        } else if (ending.status === "won") {
            const goal = goalNow();
            const eased = 1 - (1 - gone) * (1 - gone);
            drawShipShape(flight.x + (goal.x - flight.x) * eased, flight.y + (goal.y - flight.y) * eased, heading, 1 - 0.4 * eased, 1);
        } else if (ending.status !== "crashed") {
            drawShipShape(flight.x, flight.y, heading, 1, 1 - gone);
        }
    }

    function drawParticles() {
        for (const particle of state.particles) {
            ctx.globalAlpha = Math.max(particle.life, 0);
            ctx.fillStyle = particle.colour;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.r, 0, 6.2832);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawRefusal() {
        const refusal = state.refusal;
        if (!refusal) return;
        const age = (state.clock - refusal.at) / 0.5;
        if (age >= 1) {
            state.refusal = null;
            return;
        }
        ctx.strokeStyle = COLOUR.danger;
        ctx.globalAlpha = 1 - age;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(refusal.x, refusal.y, 10 + age * 10, 0, 6.2832);
        ctx.moveTo(refusal.x - 5, refusal.y - 5);
        ctx.lineTo(refusal.x + 5, refusal.y + 5);
        ctx.moveTo(refusal.x + 5, refusal.y - 5);
        ctx.lineTo(refusal.x - 5, refusal.y + 5);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    function draw() {
        ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
        ctx.fillStyle = COLOUR.space;
        ctx.fillRect(0, 0, view.width, view.height);

        ctx.translate(view.x, view.y);
        ctx.scale(view.scale, view.scale);

        const holes = allHoles();
        drawStars(hoverHole() ? holes.concat([hoverHole()]) : holes);
        drawField();
        drawZones();
        feasted(goalNow().x, goalNow().y, drawGoal);
        drawBeacons();
        feasted(state.level.ship.x, state.level.ship.y, drawStart);
        drawGhost();
        drawBodies();
        for (const hole of holes) {
            // the level's own holes are eaten with everything else; the player's do the eating
            if (hole.fixed) feasted(hole.x, hole.y, () => drawHole(hole, false));
            else drawHole(hole, (!!state.growing && hole === state.growing.hole) || (!!state.demo && hole === state.demo.hole));
        }
        drawPreview();
        drawControls();
        if (state.feast) feasted(goalNow().x, goalNow().y, drawShip);
        else drawShip();
        drawParticles();
        drawRefusal();
    }

    // ---- fitting the field to the window

    // the canvas fills the tube, which is whatever the plates above and below leave
    function resize() {
        const box = canvas.getBoundingClientRect();
        view.dpr = Math.min(window.devicePixelRatio || 1, 2);
        view.left = box.left;
        view.top = box.top;
        view.width = box.width;
        view.height = box.height;
        canvas.width = Math.round(view.width * view.dpr);
        canvas.height = Math.round(view.height * view.dpr);

        const roomWide = view.width - SCREEN_MARGIN * 2;
        const roomHigh = view.height - SCREEN_MARGIN * 2;
        view.fit = Math.max(Math.min(roomWide / WORLD.width, roomHigh / WORLD.height), 0.05);
        placeView();
    }

    // works out what the tube shows. where the field fits at a playable size it
    // is simply centred; otherwise the view is close in, centred on the pan
    // point, which is kept from straying far past the field's edges
    function placeView() {
        const small = view.fit < MIN_SCALE;
        view.zoomed = small && view.close;
        view.scale = view.zoomed ? MIN_SCALE : view.fit;

        const slack = state.phase === "flying" || state.phase === "ending" ? WORLD.margin : PAN_SLACK;
        const halfWide = view.width / 2 / view.scale;
        const halfHigh = view.height / 2 / view.scale;
        const range = {
            left: Math.min(halfWide - slack, WORLD.width / 2),
            right: Math.max(WORLD.width - halfWide + slack, WORLD.width / 2),
            top: Math.min(halfHigh - slack, WORLD.height / 2),
            bottom: Math.max(WORLD.height - halfHigh + slack, WORLD.height / 2)
        };

        if (!view.zoomed) {
            view.panX = WORLD.width / 2;
            view.panY = WORLD.height / 2;
        }
        view.panX = Math.min(Math.max(view.panX, range.left), range.right);
        view.panY = Math.min(Math.max(view.panY, range.top), range.bottom);
        view.x = view.width / 2 - view.panX * view.scale;
        view.y = view.height / 2 - view.panY * view.scale;

        const steering = view.zoomed && state.phase === "setup";
        view.more.left = steering && view.panX > range.left + 1;
        view.more.right = steering && view.panX < range.right - 1;
        view.more.up = steering && view.panY > range.top + 1;
        view.more.down = steering && view.panY < range.bottom - 1;
        showPanControls(small);
    }

    let shownPan = "";

    // the arrows appear only for directions in which there is more field to see
    function showPanControls(small) {
        const key = [small, view.zoomed, view.more.left, view.more.right, view.more.up, view.more.down].join("|");
        if (key === shownPan) return;
        shownPan = key;

        el.zoom.hidden = !small;
        el.zoom.textContent = view.zoomed ? "Map" : "Close";
        for (const side of ["left", "right", "up", "down"]) el.arrows[side].hidden = !view.more[side];
    }

    function panTo(x, y) {
        view.panX = x;
        view.panY = y;
        placeView();
    }

    // moves the view while an arrow is held, and keeps the ship in sight in flight
    function steerView(elapsed) {
        if (!view.zoomed) return;

        if (state.flight && (state.phase === "flying" || state.phase === "ending")) {
            const catchUp = 1 - Math.exp(-elapsed / FOLLOW_EASE);
            panTo(view.panX + (state.flight.x - view.panX) * catchUp, view.panY + (state.flight.y - view.panY) * catchUp);
        } else if (state.panning && state.phase === "setup") {
            panTo(view.panX + state.panning.x * PAN_SPEED * elapsed, view.panY + state.panning.y * PAN_SPEED * elapsed);
        }
    }

    function toWorld(event) {
        return { x: (event.clientX - view.left - view.x) / view.scale, y: (event.clientY - view.top - view.y) / view.scale };
    }

    // ---- the heads-up display

    function showHint(text, alert) {
        el.hint.textContent = text;
        el.hint.classList.toggle("alert", !!alert);
        state.alertUntil = alert ? state.clock + 3.5 : 0;
    }

    let shownHud = "";

    // called every frame, but only touches the page when something has changed
    function refreshHud() {
        const left = Math.max(state.level.matter - spent(), 0);
        const share = (left / state.level.matter).toFixed(3);
        const key = [share, state.phase, state.history.length, state.holes.length, !!state.growing, !!state.pressed, !!state.adjusting, !!state.tweak, !!state.demo].join("|");
        if (key === shownHud) return;
        shownHud = key;

        el.matterLeft.textContent = String(Math.round(left));
        el.matterFill.style.width = (share * 100).toFixed(1) + "%";
        el.holeCount.textContent = state.level.limit ? state.holes.length + "/" + state.level.limit : String(state.holes.length);

        const setup = state.phase === "setup";
        const busy = !!state.growing || !!state.pressed || !!state.adjusting || !!state.demo;
        el.undo.disabled = !setup || (!state.history.length && !state.tweak) || busy;
        el.reset.disabled = !setup || !state.holes.length || busy;
        el.launch.disabled = state.phase === "ending" || state.phase === "feast" || state.phase === "won" || !!state.demo;
        el.launch.textContent = state.phase === "flying" ? "Abort" : "Launch";

        // the lamp over the launch key: green when ready, red in flight, dark otherwise
        el.lamp.classList.toggle("flying", state.phase === "flying");
        el.lamp.classList.toggle("dark", el.launch.disabled);
    }

    function refuse(point, reason) {
        state.refusal = { x: point.x, y: point.y, at: state.clock };
        showHint(reason, true);
        el.matter.classList.toggle("refused", reason === "Not enough matter left.");
    }

    // ---- setting up

    // sketches the opening seconds of the flight the current holes would give
    function refreshPreview() {
        const holes = state.holes;
        const flight = S.launch(state.level);
        const steps = Math.round(PREVIEW_SECONDS / S.STEP);
        state.preview = [[flight.x, flight.y]];

        for (let i = 1; i <= steps && flight.status === "flying"; i++) {
            S.step(state.level, holes, flight);
            if (flight.jumped) state.preview.push(null);
            if (i % PATH_EVERY === 0 || flight.status !== "flying") state.preview.push([flight.x, flight.y]);
        }
    }

    // the player's hole under a point, if there is one
    function holeAt(point) {
        const least = state.touch ? TOUCH_REACH / view.scale : 0;
        for (const hole of state.holes) {
            const dx = point.x - hole.x;
            const dy = point.y - hole.y;
            const reach = Math.max(S.horizonRadius(hole.mass) + 6, least);
            if (dx * dx + dy * dy < reach * reach) return hole;
        }
        return null;
    }

    // the unseen hole the mouse carries, once it has faded in
    function hoverHole() {
        const hover = state.hover;
        if (!hover || hover.strength <= 0.01) return null;
        return { x: hover.x, y: hover.y, mass: HOVER_MASS * hover.strength };
    }

    // the bending under the mouse shows only where a new hole could go, and
    // fades in and out so that it never pops
    function easeHover(elapsed) {
        const hover = state.hover;
        if (!hover) return;

        const wanted =
            hover.inside && state.phase === "setup" && !state.growing && !state.pressed && !state.demo && !holeAt(hover) && !controlAt(hover) && S.capacityAt(state.level, state.holes, hover.x, hover.y) > 0;
        const step = elapsed / HOVER_EASE;
        hover.strength = wanted ? Math.min(hover.strength + step, 1) : Math.max(hover.strength - step, 0);
        if (!hover.inside && hover.strength === 0) state.hover = null;
    }

    function setCursor() {
        const setup = state.hover && state.phase === "setup";
        const over = setup && holeAt(state.hover);
        const control = setup && controlAt(state.hover);
        const cursor = state.pressed && state.pressed.mode === "drag" ? "grabbing" : control ? "pointer" : over ? "grab" : "crosshair";
        if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
    }

    function inZone(point) {
        return (state.level.zones || []).some((zone) => point.x >= zone.x && point.x <= zone.x + zone.w && point.y >= zone.y && point.y <= zone.y + zone.h);
    }

    function refuseHole(point) {
        const limit = state.level.limit;
        let reason = "No room for a hole there.";
        if (limit && state.holes.length >= limit) reason = "The plotter can hold only " + limit + (limit === 1 ? " hole" : " holes") + " here.";
        else if (state.level.matter - spent() < S.MIN_MASS) reason = "Not enough matter left.";
        else if (inZone(point)) reason = "No holes in the exclusion zone.";
        refuse(point, reason);
    }

    // a press on empty space starts a new hole, which grows until released
    function startHole(point) {
        const capacity = S.capacityAt(state.level, state.holes, point.x, point.y);
        if (!capacity) {
            refuseHole(point);
            return;
        }

        el.matter.classList.remove("refused");
        const hole = { x: point.x, y: point.y, mass: S.MIN_MASS };
        state.holes.push(hole);
        state.assisted = false;
        state.growing = { hole: hole, was: null, start: hole.mass, capacity: capacity, since: state.clock };
        refreshPreview();
    }

    function grow() {
        const growing = state.growing;
        const mass = Math.min(growing.start + (state.clock - growing.since) * S.GROW_RATE, growing.capacity);
        if (mass !== growing.hole.mass) {
            growing.hole.mass = mass;
            refreshPreview();
        }
    }

    function stopGrowing() {
        if (!state.growing) return;
        state.history.push({ hole: state.growing.hole, was: state.growing.was });
        state.growing = null;
        refreshPreview();
    }

    // a hole follows the pointer wherever there is room for it, and waits at
    // the last good spot wherever there is not
    function drag(point) {
        const pressed = state.pressed;
        const hole = pressed.hole;
        const x = point.x - pressed.grip.x;
        const y = point.y - pressed.grip.y;
        const others = state.holes.filter((other) => other !== hole);

        if (S.capacityAt(state.level, others, x, y) < hole.mass - 1e-9) return;
        hole.x = x;
        hole.y = y;
        state.assisted = false;

        // the last flight was flown round the old layout, so its trail no longer means anything
        state.ghost = [];
        refreshPreview();
    }

    // ---- adjusting a hole: select it, then give or take matter, or remove it

    // where the selected hole's controls sit, kept inside the tube
    function controls() {
        const hole = state.selected;
        if (!hole || state.phase !== "setup" || state.demo || state.holes.indexOf(hole) < 0) return null;

        const radius = (state.touch ? TOUCH_CONTROL_RADIUS : CONTROL_RADIUS) / view.scale;
        const reach = S.horizonRadius(hole.mass) + CONTROL_GAP / view.scale + radius;
        const edge = radius + 4 / view.scale;
        const left = -view.x / view.scale + edge;
        const top = -view.y / view.scale + edge;
        const right = (view.width - view.x) / view.scale - edge;
        const bottom = (view.height - view.y) / view.scale - edge;
        const keep = (x, y) => ({ x: Math.min(Math.max(x, left), right), y: Math.min(Math.max(y, top), bottom) });

        return { radius: radius, up: keep(hole.x, hole.y - reach), down: keep(hole.x, hole.y + reach), remove: keep(hole.x + reach, hole.y) };
    }

    function controlAt(point) {
        const set = controls();
        if (!set) return null;
        for (const name of ["up", "down", "remove"]) {
            const dx = point.x - set[name].x;
            const dy = point.y - set[name].y;
            if (dx * dx + dy * dy < set.radius * set.radius) return name;
        }
        return null;
    }

    function drawControls() {
        const set = controls();
        if (!set) return;
        const hole = state.selected;
        const radius = S.horizonRadius(hole.mass);
        const unit = 1 / view.scale;

        // a collar round the chosen hole, and its size
        ctx.strokeStyle = COLOUR.matter;
        ctx.lineWidth = 1.2 * unit;
        ctx.globalAlpha = 0.8;
        ctx.setLineDash([4 * unit, 4 * unit]);
        ctx.beginPath();
        ctx.arc(hole.x, hole.y, radius + 5 * unit, 0, 6.2832);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = COLOUR.matter;
        ctx.font = 13 * unit + "px ui-monospace, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.globalAlpha = 1;
        ctx.fillText(String(Math.round(hole.mass)), set.up.x + set.radius + 6 * unit, set.up.y + 4 * unit);

        const live = state.adjusting ? (state.adjusting.direction > 0 ? "up" : "down") : null;
        for (const name of ["up", "down", "remove"]) {
            const at = set[name];
            const colour = name === "remove" ? COLOUR.danger : COLOUR.matter;
            const arm = set.radius * 0.42;

            ctx.globalAlpha = name === live ? 0.45 : 0.85;
            ctx.fillStyle = name === live ? colour : "rgba(6, 8, 7, 0.9)";
            ctx.beginPath();
            ctx.arc(at.x, at.y, set.radius, 0, 6.2832);
            ctx.fill();

            ctx.globalAlpha = 1;
            ctx.strokeStyle = colour;
            ctx.lineWidth = 1.2 * unit;
            ctx.beginPath();
            ctx.arc(at.x, at.y, set.radius, 0, 6.2832);
            ctx.stroke();

            ctx.lineWidth = 1.8 * unit;
            ctx.beginPath();
            if (name === "remove") {
                ctx.moveTo(at.x - arm, at.y - arm);
                ctx.lineTo(at.x + arm, at.y + arm);
                ctx.moveTo(at.x + arm, at.y - arm);
                ctx.lineTo(at.x - arm, at.y + arm);
            } else {
                const tip = name === "up" ? -arm * 0.7 : arm * 0.7;
                ctx.moveTo(at.x - arm, at.y - tip);
                ctx.lineTo(at.x, at.y + tip);
                ctx.lineTo(at.x + arm, at.y - tip);
            }
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    // sets a hole's matter, within the smallest a hole can be and the most there
    // is matter and room for. returns whether anything changed
    function setMass(hole, mass) {
        const others = state.holes.filter((other) => other !== hole);
        const most = Math.max(S.capacityAt(state.level, others, hole.x, hole.y), hole.mass);
        const next = Math.min(Math.max(mass, S.MIN_MASS), most);
        if (next === hole.mass) return false;
        hole.mass = next;
        state.assisted = false;
        refreshPreview();
        return true;
    }

    // wheel and key changes come in runs. a run is recorded for undo once it goes quiet
    function settleTweak() {
        const tweak = state.tweak;
        state.tweak = null;
        if (tweak && tweak.hole.mass !== tweak.was.mass) state.history.push({ hole: tweak.hole, was: tweak.was });
    }

    function tweakMass(hole, change) {
        if (!state.tweak || state.tweak.hole !== hole) {
            settleTweak();
            state.tweak = { hole: hole, was: { x: hole.x, y: hole.y, mass: hole.mass }, last: state.clock };
        }
        setMass(hole, hole.mass + change);
        state.tweak.last = state.clock;
    }

    function removeHole(hole) {
        const index = state.holes.indexOf(hole);
        if (index < 0) return;
        settleTweak();
        state.holes.splice(index, 1);
        state.history.push({ hole: hole, gone: index });
        state.selected = null;
        state.assisted = false;
        refreshPreview();
    }

    // a control answers a tap with one step, and a hold by running on
    function useControl(name) {
        const hole = state.selected;
        if (name === "remove") {
            removeHole(hole);
            return;
        }
        const direction = name === "up" ? 1 : -1;
        const was = { x: hole.x, y: hole.y, mass: hole.mass };
        setMass(hole, hole.mass + direction * TAP_STEP);
        state.adjusting = { hole: hole, direction: direction, was: was, start: hole.mass, since: state.clock };
    }

    function adjust() {
        const adjusting = state.adjusting;
        const held = state.clock - adjusting.since - ADJUST_DELAY;
        if (held > 0) setMass(adjusting.hole, adjusting.start + adjusting.direction * S.GROW_RATE * held);
    }

    function press(event) {
        if (state.demo) return;
        state.touch = event.pointerType === "touch";
        const point = toWorld(event);
        settleTweak();

        const control = controlAt(point);
        if (control) {
            useControl(control);
            return;
        }

        const hole = holeAt(point);

        if (!hole) {
            // with a hole selected, a press elsewhere only lets go of it
            if (state.selected) state.selected = null;
            else startHole(point);
            return;
        }

        state.pressed = {
            hole: hole,
            mode: "waiting",
            since: state.clock,
            screen: { x: event.clientX, y: event.clientY },
            grip: { x: point.x - hole.x, y: point.y - hole.y },
            was: { x: hole.x, y: hole.y, mass: hole.mass }
        };
    }

    function movePointer(event) {
        const point = toWorld(event);
        const pressed = state.pressed;
        state.touch = event.pointerType === "touch";

        if (event.pointerType === "mouse") {
            if (!state.hover) state.hover = { x: point.x, y: point.y, strength: 0, inside: true };
            state.hover.x = point.x;
            state.hover.y = point.y;
            state.hover.inside = true;
        }

        if (!pressed) return;

        if (pressed.mode === "waiting") {
            const dx = event.clientX - pressed.screen.x;
            const dy = event.clientY - pressed.screen.y;
            const far = state.touch ? TOUCH_DRAG_DISTANCE : DRAG_DISTANCE;
            if (dx * dx + dy * dy > far * far) pressed.mode = "drag";
        }
        if (pressed.mode === "drag") drag(point);
    }

    function release() {
        const pressed = state.pressed;
        const adjusting = state.adjusting;
        state.pressed = null;
        state.adjusting = null;
        stopGrowing();

        if (adjusting && adjusting.hole.mass !== adjusting.was.mass) state.history.push({ hole: adjusting.hole, was: adjusting.was });

        if (pressed && pressed.mode === "drag" && (pressed.hole.x !== pressed.was.x || pressed.hole.y !== pressed.was.y)) {
            state.history.push({ hole: pressed.hole, was: pressed.was });
        }

        // a press on a hole that did not drag it selects it
        if (pressed && pressed.mode === "waiting") state.selected = pressed.hole;
    }

    // clears every hole the player has placed. it is one more change, so undo brings them back
    function reset() {
        if (state.phase !== "setup" || state.growing || state.pressed || state.adjusting || state.demo || !state.holes.length) return;
        settleTweak();
        state.selected = null;
        state.assisted = false;
        state.history.push({ cleared: state.holes, ghost: state.ghost });
        state.holes = [];
        state.ghost = [];
        refreshPreview();
    }

    // takes back the last change: a new hole goes; a fed or moved one returns to
    // how it was; a reset is put back
    function undo() {
        if (state.phase !== "setup" || state.growing || state.pressed || state.adjusting || state.demo) return;
        settleTweak();
        if (!state.history.length) return;
        state.assisted = false;
        const last = state.history.pop();
        if (last.gone !== undefined) {
            state.holes.splice(last.gone, 0, last.hole);
        } else if (last.cleared) {
            state.holes = last.cleared;
            state.ghost = last.ghost;
        } else if (last.was) {
            last.hole.x = last.was.x;
            last.hole.y = last.was.y;
            last.hole.mass = last.was.mass;
        } else {
            state.holes.splice(state.holes.indexOf(last.hole), 1);
        }
        refreshPreview();
    }

    // ---- giving up

    // the plotter clears the field and places a known answer, hole by hole, then launches
    function giveUp() {
        if (state.phase !== "setup" || state.demo || !state.level.answer) return;
        release();
        settleTweak();
        state.selected = null;
        el.levels.hidden = true;
        state.holes = [];
        state.history = [];
        state.ghost = [];
        state.assisted = true;
        state.demo = { index: 0, hole: null, wait: DEMO_PAUSE };
        refreshPreview();
        showHint("Plotting a course.");
    }

    function stepDemo(elapsed) {
        const demo = state.demo;
        if (demo.wait > 0) {
            demo.wait -= elapsed;
            return;
        }

        const target = state.level.answer[demo.index];
        if (!target) {
            state.demo = null;
            launch();
            return;
        }

        if (!demo.hole) {
            demo.hole = { x: target.x, y: target.y, mass: S.MIN_MASS };
            state.holes.push(demo.hole);
            if (view.zoomed) panTo(target.x, target.y);
        }

        demo.hole.mass = Math.min(demo.hole.mass + DEMO_GROW * elapsed, target.mass);
        refreshPreview();

        if (demo.hole.mass === target.mass) {
            demo.hole = null;
            demo.index++;
            demo.wait = DEMO_PAUSE;
        }
    }

    // ---- flying

    function launch() {
        if (state.phase !== "setup" || state.demo) return;
        release();
        settleTweak();

        // with no fuel and nothing pulling, the ship would only sit there until time ran out
        if (S.becalmed(state.level, state.holes)) {
            showHint("Nothing is pulling the ship. Place a hole.", true);
            return;
        }

        state.flight = S.launch(state.level);
        state.path = [[state.flight.x, state.flight.y]];
        state.phase = "flying";
        state.launches++;
        state.ending = null;
        state.panning = null;
        view.saved = { x: view.panX, y: view.panY };
        showHint(state.level.hint);
    }

    function backToSetup() {
        state.phase = "setup";
        state.flight = null;
        state.ending = null;
        refreshPreview();

        // the view returns to wherever the player was working before the flight
        if (view.saved) panTo(view.saved.x, view.saved.y);
        else placeView();
    }

    function abort() {
        if (state.phase !== "flying") return;
        state.ghost = state.path;
        backToSetup();
    }

    function scatter(x, y, colour, count, speed) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * 6.2832;
            const pace = speed * (0.3 + Math.random());
            state.particles.push({ x: x, y: y, vx: Math.cos(angle) * pace, vy: Math.sin(angle) * pace, r: 0.8 + Math.random() * 1.6, life: 1, colour: colour });
        }
    }

    function finishFlight() {
        const flight = state.flight;
        state.phase = "ending";
        state.ending = { status: flight.status, cause: flight.cause, age: 0 };

        if (flight.status === "won") recordWin();
        if (flight.status === "crashed") scatter(flight.x, flight.y, "#ffd9b8", 26, 120);
        if (flight.status === "imploded") scatter(flight.cause.x, flight.cause.y, "#fff1dc", 14, 60);
        if (flight.status === "won") scatter(goalNow().x, goalNow().y, COLOUR.goal, 30, 110);
    }

    function fly(elapsed) {
        const flight = state.flight;
        state.owed = (state.owed || 0) + elapsed;

        while (state.owed >= S.STEP && flight.status === "flying") {
            S.step(state.level, state.holes, flight);
            state.owed -= S.STEP;
            state.steps = (state.steps || 0) + 1;
            if (flight.reached) scatter(flight.reached.x, flight.reached.y, COLOUR.beacon, 16, 80);
            if (flight.jumped) {
                state.path.push(null);
                scatter(flight.jumped.from.x, flight.jumped.from.y, COLOUR.wormhole, 10, 70);
                scatter(flight.jumped.to.x, flight.jumped.to.y, COLOUR.wormhole, 10, 70);
            }
            if (state.steps % PATH_EVERY === 0) state.path.push([flight.x, flight.y]);
        }

        if (flight.status !== "flying") {
            state.owed = 0;
            state.path.push([flight.x, flight.y]);
            finishFlight();
        }
    }

    function finishEnding() {
        if (state.ending.status === "won") {
            // no level can be won without a hole, but if one ever is there is nothing to do the eating
            if (!state.holes.length) {
                showWon();
                return;
            }
            state.phase = "feast";
            state.feast = { age: 0 };
            return;
        }
        state.ghost = state.path;
        const message = ENDINGS[state.ending.status];
        backToSetup();
        showHint(message, true);
    }

    // ---- levels

    function loadLevel(index) {
        state.index = index;
        state.level = LEVELS[index];
        state.phase = "setup";
        state.holes = [];
        state.history = [];
        state.growing = null;
        state.pressed = null;
        state.selected = null;
        state.adjusting = null;
        state.tweak = null;
        state.demo = null;
        state.assisted = false;
        state.flight = null;
        state.path = [];
        state.ghost = [];
        state.ending = null;
        state.feast = null;
        state.particles = [];
        state.launches = 0;
        rockShapes.clear();

        el.levelNumber.textContent = String(index + 1).padStart(2, "0");
        el.fuel.hidden = !outOfFuel();
        el.levelName.textContent = state.level.name;
        el.won.hidden = true;
        el.levels.hidden = true;
        el.manual.hidden = true;
        el.matter.classList.remove("refused");
        showHint(state.level.hint);
        refreshPreview();
        shownHud = "";
        view.saved = null;
        panTo(state.level.ship.x, state.level.ship.y);
    }

    // the best result so far on a level: fewest holes and least matter, each
    // kept on its own. (an older save held only the matter, as a bare number)
    function bestFor(index) {
        const saved = progress.best[index];
        if (typeof saved === "number") return { matter: saved };
        return saved || {};
    }

    function lesser(earlier, now) {
        return earlier === undefined ? now : Math.min(earlier, now);
    }

    // saved the moment the ship docks, so that leaving during the feast loses nothing
    // a win with the plotter's holes opens the next sector but earns no score
    function recordWin() {
        const earlier = bestFor(state.index);
        if (!state.assisted) progress.best[state.index] = { holes: lesser(earlier.holes, state.holes.length), matter: lesser(earlier.matter, Math.round(spent())) };
        progress.unlocked = Math.max(progress.unlocked, Math.min(state.index + 1, LEVELS.length - 1));
        saveProgress();
    }

    function showWon() {
        const matter = Math.round(spent());
        const holes = state.holes.length;
        const last = state.index === LEVELS.length - 1;
        const best = bestFor(state.index);

        state.phase = "won";
        el.wonDetail.textContent = state.assisted
            ? "Course plotted by the computer.\n" +
              "Holes     " + holes + "\n" +
              "Matter    " + matter + " of " + state.level.matter + "\n" +
              "No score recorded."
            : "Holes     " + holes + "   best " + best.holes + "\n" +
              "Matter    " + matter + " of " + state.level.matter + "   best " + best.matter + "\n" +
              "Launches  " + state.launches +
              (last ? "\n\nFinal sector cleared." : "");
        el.next.textContent = last ? "Start over" : "Next sector";
        el.won.hidden = false;
        el.next.focus();
    }

    function showLevels() {
        el.levelList.textContent = "";
        LEVELS.forEach(function (level, index) {
            const item = document.createElement("li");
            const button = document.createElement("button");
            const name = document.createElement("span");
            const best = document.createElement("span");

            button.type = "button";
            button.disabled = index > progress.unlocked;
            if (index === state.index) button.setAttribute("aria-current", "true");
            const record = bestFor(index);
            name.textContent = String(index + 1).padStart(2, "0") + "  " + (button.disabled ? "Locked" : level.name);
            best.className = "best";
            best.textContent =
                record.matter === undefined ? "" : (record.holes === undefined ? "" : record.holes + "H ") + record.matter + "M";
            if (record.matter !== undefined) best.title = "Best: " + (record.holes === undefined ? "" : record.holes + (record.holes === 1 ? " hole, " : " holes, ")) + record.matter + " matter";
            button.appendChild(name);
            button.appendChild(best);
            button.addEventListener("click", function () {
                loadLevel(index);
            });

            item.appendChild(button);
            el.levelList.appendChild(item);
        });
        el.giveUp.disabled = state.phase !== "setup" || !!state.demo || !state.level.answer;
        el.levels.hidden = false;
        el.levelsClose.focus();
    }

    // ---- the manual

    // the instructions are written for the device in hand: a finger or a mouse
    // and keyboard, and with panning only where the field does not fit
    function manualEntries() {
        const touch = state.touch || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
        const press = touch ? "Press" : "Click";
        const entries = [
            ["Objective", "Get the ship to the station. You cannot steer it. Place black holes, and their gravity bends its course."],
            ["Place a hole", press + " an empty part of the field and hold. The hole grows, using up matter, until you let go."],
            ["Move a hole", press + " one of your holes and drag it."],
            [
                "Adjust a hole",
                (touch ? "Tap" : "Click") + " one of your holes to select it. The arrows above and below it give and take matter, and the cross removes it." +
                    (touch ? "" : " The up and down keys and the mouse wheel do the same; Delete removes it.")
            ],
            ["Launch", (touch ? "Press Launch." : "Click Launch, or press Space.") + " The dotted line shows the first seconds of the flight. In flight the same key aborts."],
            ["Undo, reset", "Undo takes back your last change" + (touch ? "" : " (Z)") + ". Reset clears every hole" + (touch ? "" : " (R)") + "."],
            ["Hazards", "The ship is lost if it strays inside a black hole, hits a rock or planet, leaves the field, or flies " + S.FLIGHT_LIMIT + " seconds without docking."]
        ];
        if (view.fit < MIN_SCALE) {
            entries.push(["Look around", "The field is bigger than the screen. " + (touch ? "Hold an arrow" : "Hold an arrow, or use the arrow keys,") + " to pan. Map shows the whole field."]);
        }
        entries.push(["Further out", "Later sectors add amber beacons to pass before the station opens, hatched zones that take no holes, and a ship with no fuel, which sits until something pulls it."]);
        entries.push(["Score", "Fewer holes and less matter are better. Your best of each is kept for every sector."]);
        entries.push(["Stuck", "Open the sector index and choose I give up. The plotter places the holes and flies the sector for you, for no score."]);
        return entries;
    }

    function showManual() {
        el.manualList.textContent = "";
        for (const entry of manualEntries()) {
            const term = document.createElement("dt");
            const detail = document.createElement("dd");
            term.textContent = entry[0];
            detail.textContent = entry[1];
            el.manualList.appendChild(term);
            el.manualList.appendChild(detail);
        }
        el.manual.hidden = false;
        el.manualClose.focus();
    }

    function closeManual() {
        el.manual.hidden = true;
        if (!progress.manual) {
            progress.manual = true;
            saveProgress();
        }
    }

    // ---- the loop

    let lastFrame = 0;

    function frame(now) {
        const elapsed = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0;
        lastFrame = now;
        state.clock += elapsed;

        if (state.demo) stepDemo(elapsed);
        if (state.adjusting) adjust();
        if (state.tweak && state.clock - state.tweak.last > TWEAK_SETTLE) settleTweak();
        if (state.selected && state.holes.indexOf(state.selected) < 0) state.selected = null;
        if (state.growing) grow();
        easeHover(elapsed);
        setCursor();
        steerView(elapsed);
        if (state.phase === "flying") fly(elapsed);

        if (state.phase === "ending") {
            state.ending.age += elapsed;
            if (state.ending.age >= ENDING_SECONDS) finishEnding();
        }

        if (state.feast) {
            state.feast.age += elapsed;
            if (state.phase === "feast" && state.feast.age >= FEAST_SECONDS) showWon();
        }

        for (const particle of state.particles) {
            particle.x += particle.vx * elapsed;
            particle.y += particle.vy * elapsed;
            particle.life -= elapsed * 1.4;
        }
        state.particles = state.particles.filter((particle) => particle.life > 0);

        if (state.alertUntil && state.clock > state.alertUntil && state.phase === "setup") showHint(state.level.hint);

        refreshHud();
        draw();
        window.requestAnimationFrame(frame);
    }

    // ---- input

    canvas.addEventListener("pointerdown", function (event) {
        // a press during the feast skips to the result
        if (event.button === 0 && state.phase === "feast") {
            showWon();
            return;
        }
        if (event.button !== 0 || state.phase !== "setup" || state.growing || state.pressed) return;
        event.preventDefault();
        canvas.setPointerCapture(event.pointerId);
        press(event);
    });

    canvas.addEventListener("pointermove", movePointer);
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("pointerleave", function () {
        if (state.hover) state.hover.inside = false;
    });
    canvas.addEventListener("contextmenu", function (event) {
        event.preventDefault();
    });

    // the wheel, over a hole, gives and takes matter
    canvas.addEventListener(
        "wheel",
        function (event) {
            if (state.phase !== "setup" || state.demo || state.growing || state.pressed || state.adjusting) return;
            const hole = holeAt(toWorld(event));
            if (!hole) return;
            event.preventDefault();
            // some mice report lines, not pixels
            tweakMass(hole, -event.deltaY * (event.deltaMode === 1 ? 16 : 1) * WHEEL_RATE);
        },
        { passive: false }
    );

    el.undo.addEventListener("click", undo);
    el.reset.addEventListener("click", reset);
    el.zoom.addEventListener("click", function () {
        view.close = !view.close;
        placeView();
    });

    // an arrow pans for as long as it is held
    const PAN_DIRECTIONS = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };
    for (const side of ["left", "right", "up", "down"]) {
        const arrow = el.arrows[side];
        const stop = function () {
            state.panning = null;
        };
        arrow.addEventListener("pointerdown", function (event) {
            event.preventDefault();
            state.panning = PAN_DIRECTIONS[side];
        });
        arrow.addEventListener("pointerup", stop);
        arrow.addEventListener("pointercancel", stop);
        arrow.addEventListener("pointerleave", stop);
    }
    el.launch.addEventListener("click", function () {
        if (state.phase === "flying") abort();
        else launch();
    });
    el.replay.addEventListener("click", function () {
        loadLevel(state.index);
    });
    el.next.addEventListener("click", function () {
        loadLevel(state.index === LEVELS.length - 1 ? 0 : state.index + 1);
    });
    el.levelsOpen.addEventListener("click", showLevels);
    el.levelsClose.addEventListener("click", function () {
        el.levels.hidden = true;
    });
    el.giveUp.addEventListener("click", giveUp);
    el.manualOpen.addEventListener("click", showManual);
    el.manualClose.addEventListener("click", closeManual);

    window.addEventListener("keydown", function (event) {
        if (event.metaKey || event.altKey) return;
        const overlay = !el.won.hidden || !el.levels.hidden || !el.manual.hidden;

        if (event.key === "Escape" && !el.manual.hidden) {
            closeManual();
        } else if (event.key === "Escape" && !el.levels.hidden) {
            el.levels.hidden = true;
        } else if (overlay) {
            return;
        } else if (state.phase === "feast" && (event.key === " " || event.key === "Enter")) {
            event.preventDefault();
            showWon();
        } else if (event.key === " " || event.key === "Enter") {
            // a focused button answers the key itself
            if (document.activeElement && document.activeElement.tagName === "BUTTON") return;
            event.preventDefault();
            if (state.phase === "flying") abort();
            else launch();
        } else if (event.key === "z" || event.key === "Z" || event.key === "Backspace") {
            event.preventDefault();
            undo();
        } else if (event.key === "r" || event.key === "R") {
            reset();
        } else if (state.selected && state.phase === "setup" && !state.demo && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            // up and down give and take matter from the selected hole; with shift, in bigger steps
            event.preventDefault();
            tweakMass(state.selected, (event.key === "ArrowUp" ? TAP_STEP : -TAP_STEP) * (event.shiftKey ? 5 : 1));
        } else if (state.selected && state.phase === "setup" && !state.demo && event.key === "Delete") {
            removeHole(state.selected);
        } else if (state.selected && event.key === "Escape") {
            state.selected = null;
        } else if (event.key.indexOf("Arrow") === 0 && view.zoomed && state.phase === "setup") {
            event.preventDefault();
            const step = PAN_DIRECTIONS[event.key.slice(5).toLowerCase()];
            panTo(view.panX + step.x * 120, view.panY + step.y * 120);
        }
    });

    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", function () {
        // some phones report the new size a moment after they turn
        window.setTimeout(resize, 250);
    });

    resize();
    loadLevel(Math.min(progress.unlocked, LEVELS.length - 1));
    if (!progress.manual) showManual();
    window.requestAnimationFrame(frame);

    // a handle for tests
    window.HolePunchGame = { state: state, view: view, loadLevel: loadLevel };
})();
