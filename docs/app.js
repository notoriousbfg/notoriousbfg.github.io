(function () {
    var field = document.getElementById("star-field");
    if (!field) return;

    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var COLUMNS = 25;
    var ROWS = 17;
    var MIN_SIZE = 1;
    var MAX_SIZE = 2;
    var LARGE_STAR_CHANCE = 0.15;
    var LARGE_MIN_SIZE = 2.5;
    var LARGE_MAX_SIZE = 3;
    var MIN_SPEED = 0.2;
    var MAX_SPEED = 1;
    var RESIZE_DEBOUNCE_MS = 200;

    // the black hole that follows the mouse. stars are lensed as if by a point mass:
    // a star at distance b from the hole appears at (b + sqrt(b² + 4E²)) / 2, where
    // E is the einstein radius, with a fainter second image on the far side of the hole.
    // the hole itself is invisible: images falling within the shadow radius are swallowed
    var EINSTEIN_RADIUS = 44;
    var SHADOW_RADIUS = 26;
    var LENS_FULL_RADIUS = EINSTEIN_RADIUS * 3;
    var LENS_END_RADIUS = EINSTEIN_RADIUS * 10;
    var MAX_STRETCH = 8;
    var STRETCH_EXAGGERATION = 2;
    var MAX_BRIGHTNESS = 1.2;
    var MIN_SQUASH = 0.5;
    var GHOST_FADE_PX = 8;
    var HOLE_FOLLOW_MS = 90;
    var HOLE_GROW_MS = 300;
    // the hole fades out as the share of stars left on screen falls between these
    var HOLE_FULL_STAR_SHARE = 0.25;
    var HOLE_GONE_STAR_SHARE = 0.05;

    // the planets sit far off in the distance and drift slowly with the page.
    // sizes are in svg units, saturn's rings as multiples of the planet's radius
    var PLANET_RADIUS = 42;
    var SATURN_SPEED = 0.12;
    var MARS_SPEED = 0.18;
    // the endurance, a wheel of twelve modules around a docking hub, drifts
    // nearer than the planets. it is modelled in 3d, in units of the wheel's
    // radius, and painted afresh each frame as it turns, seen from a little
    // above its plane
    var ENDURANCE_SPEED = 0.3;
    var ENDURANCE_ELEVATION = 0.5;
    var ENDURANCE_ROLL = -18;
    var ENDURANCE_SPIN_RATE = 20; // degrees a second
    var ENDURANCE_EXTENT = 1.2;
    var ENDURANCE_HULL = [226, 230, 238];
    // the planets are drawn onto canvases wide enough to hold their lensed images,
    // which reach at most an einstein radius beyond the planet and, for the
    // counter-image, an einstein radius around the hole
    var PLANET_CANVAS_PAD = EINSTEIN_RADIUS * 2.5 + 10;
    // how sharply the planets' bending falls off with distance from the hole. 1 is
    // a true point mass; higher squeezes the einstein ring of a planet thinner
    var PLANET_LENS_SHARPNESS = 4;
    var RING_TILT = 0.3;
    var RING_ANGLE = -24;
    var RING_BANDS = [
        { from: 1.22, to: 1.5, opacity: 0.3 },
        { from: 1.56, to: 2.02, opacity: 0.65 },
        { from: 2.08, to: 2.3, opacity: 0.4 }
    ];
    // dark markings on mars, placed on the globe as fractions of its radius
    var MARS_MARKINGS = [
        { x: -0.35, y: -0.15, rx: 0.42, ry: 0.2, rotate: -15, opacity: 0.35 },
        { x: 0.3, y: 0.1, rx: 0.3, ry: 0.16, rotate: 20, opacity: 0.3 },
        { x: -0.1, y: 0.42, rx: 0.5, ry: 0.14, rotate: -5, opacity: 0.25 },
        { x: 0.45, y: -0.4, rx: 0.2, ry: 0.1, rotate: 30, opacity: 0.25 }
    ];
    var PLANET_BANDS = [
        { height: -0.6, width: 3, opacity: 0.18 },
        { height: -0.32, width: 6, opacity: 0.12 },
        { height: 0.02, width: 4, opacity: 0.2 },
        { height: 0.3, width: 7, opacity: 0.1 },
        { height: 0.58, width: 3, opacity: 0.16 }
    ];

    // clicking empty space pins the hole to the page, where it starts to feed. a
    // front spreads out from it, and whatever the front reaches spirals in: the
    // pull is FEED_PULL / distance, with a sideways kick and some drag
    var FEED_FRONT_SPEED = 260;
    var FEED_PULL = 110000;
    var FEED_PULL_FLOOR = 30;
    var FEED_SWIRL = 150;
    var FEED_DRAG = 0.9;
    var FEED_FADE_PX = 36;
    var FEED_STREAK_SPEED = 110;
    var PLANET_DIGEST_S = 1.6;
    var PLANET_DIGEST_DRAG = 6;
    // clicking again lets everything go, to fly back to where it belongs
    var RELEASE_S = 1.4;
    // once the hole has eaten the whole sky it stays eaten from page to page,
    // until a click lets it all go again
    var SHOW_STARS_KEY = "showStars";

    function readShowStars() {
        try {
            return window.localStorage.getItem(SHOW_STARS_KEY) !== "false";
        } catch (e) {
            return true;
        }
    }

    function storeShowStars(show) {
        try {
            window.localStorage.setItem(SHOW_STARS_KEY, show ? "true" : "false");
        } catch (e) {}
    }

    var devoured = !reduceMotion && !readShowStars();

    var stars = [];
    var planets = [];
    var hole = {
        x: 0,
        y: 0,
        targetX: 0,
        targetY: 0,
        mass: 0,
        targetMass: 0,
        summoned: false,
        pinned: false,
        pageX: 0,
        pageY: 0,
        front: 0
    };

    function random(min, max) {
        return min + Math.random() * (max - min);
    }

    function smoothstep(from, to, value) {
        var t = Math.min(Math.max((value - from) / (to - from), 0), 1);
        return t * t * (3 - 2 * t);
    }

    function buildStars() {
        field.innerHTML = "";
        stars = [];
        hole.front = devoured ? Infinity : 0;

        var cellWidthPercent = 100 / COLUMNS;
        var cellHeightPercent = 100 / ROWS;
        var fieldWidth = field.clientWidth;
        var fieldHeight = field.clientHeight;

        for (var row = 0; row < ROWS; row++) {
            for (var col = 0; col < COLUMNS; col++) {
                var star = document.createElement("div");
                var large = Math.random() < LARGE_STAR_CHANCE;
                star.className = large ? "star star-large" : "star";

                var xPercent = col * cellWidthPercent + random(cellWidthPercent * 0.15, cellWidthPercent * 0.85);
                var yPercent = row * cellHeightPercent + random(cellHeightPercent * 0.15, cellHeightPercent * 0.85);
                var size = large ? random(LARGE_MIN_SIZE, LARGE_MAX_SIZE) : random(MIN_SIZE, MAX_SIZE);

                var distanceFromCenter = Math.abs(xPercent - 50) / 50;
                var opacityScale = 0.35 + distanceFromCenter * 0.65;

                star.style.left = xPercent + "%";
                star.style.top = yPercent + "%";
                star.style.width = size + "px";
                star.style.height = size + "px";
                star.style.animationDuration = random(3, 6) + "s";
                star.style.animationDelay = "-" + random(0, 6) + "s";
                star.style.setProperty("--star-opacity-scale", opacityScale);

                field.appendChild(star);

                if (!reduceMotion) {
                    stars.push({
                        el: star,
                        ghost: null,
                        ghostVisible: false,
                        steady: false,
                        opacityText: null,
                        fall: null,
                        release: null,
                        x: (xPercent / 100) * fieldWidth + size / 2,
                        y: (yPercent / 100) * fieldHeight + size / 2,
                        speed: random(MIN_SPEED, MAX_SPEED),
                        opacityScale: opacityScale
                    });
                }
            }
        }

        planets = [
            makePlanet("saturn", buildSaturn(), SATURN_SPEED),
            makePlanet("mars", buildMars(), MARS_SPEED),
            makePlanet("endurance", paintEndurance, ENDURANCE_SPEED)
        ];

        if (devoured) {
            for (var s = 0; s < stars.length; s++) {
                stars[s].fall = eatenFall();
            }
            for (var p = 0; p < planets.length; p++) {
                planets[p].fall = eatenFall();
                planets[p].digested = 1;
            }
        }

        draw();
    }

    // the outline of a tilted ring seen edge-on-ish: an ellipse squashed by the tilt
    function ellipsePath(radius, sweep) {
        var ry = radius * RING_TILT;
        return "M " + -radius + " 0 A " + radius + " " + ry + " 0 1 " + sweep + " " + radius + " 0 A " + radius + " " + ry + " 0 1 " + sweep + " " + -radius + " 0 Z";
    }

    function ringPath(band) {
        return ellipsePath(band.to * PLANET_RADIUS, 0) + " " + ellipsePath(band.from * PLANET_RADIUS, 1);
    }

    // a line of latitude on the globe, of which only the half facing us is drawn
    function latitudePath(band) {
        var r = PLANET_RADIUS;
        var z = band.height * r;
        var radius = Math.sqrt(r * r - z * z);
        var cosTilt = Math.sqrt(1 - RING_TILT * RING_TILT);
        var cy = -z * cosTilt;
        return "M " + -radius + " " + cy + " A " + radius + " " + radius * RING_TILT + " 0 0 0 " + radius + " " + cy;
    }

    // a planet is rasterised into a sprite, then drawn on a canvas each frame so
    // that the hole can bend it pixel by pixel. the sprite comes either from an
    // svg, drawn once, or from a function that repaints it as the body turns
    function makePlanet(name, source, speed) {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var el = document.createElement("div");
        el.className = "planet planet-" + name;
        field.appendChild(el);

        var size = el.offsetWidth;
        var pad = PLANET_CANVAS_PAD;
        el.style.height = size + "px";

        var canvas = document.createElement("canvas");
        canvas.width = canvas.height = Math.round((size + pad * 2) * dpr);
        canvas.style.width = canvas.style.height = size + pad * 2 + "px";
        canvas.style.left = canvas.style.top = -pad + "px";
        el.appendChild(canvas);

        var planet = {
            el: el,
            canvas: canvas,
            ctx: canvas.getContext("2d"),
            speed: speed,
            size: size,
            pad: pad,
            dpr: dpr,
            x: el.offsetLeft + size / 2,
            y: el.offsetTop + size / 2,
            spriteSize: Math.round(size * dpr),
            sprite: document.createElement("canvas"),
            spriteCtx: null,
            ready: false,
            paint: null,
            spin: 0,
            pixels: null,
            output: null,
            drawn: null,
            fall: null,
            release: null,
            digested: 0
        };

        planet.sprite.width = planet.sprite.height = planet.spriteSize;
        planet.spriteCtx = planet.sprite.getContext("2d");
        planet.output = planet.ctx.createImageData(canvas.width, canvas.height);

        if (typeof source === "function") {
            planet.paint = source;
            planet.paint(planet.spriteCtx, planet.spriteSize, planet.spin);
            planet.ready = true;
            return planet;
        }

        var image = new Image();
        image.onload = function () {
            planet.spriteCtx.drawImage(image, 0, 0, planet.spriteSize, planet.spriteSize);
            planet.ready = true;
            requestFrame();
        };
        var sized = source.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="' + planet.spriteSize + '" height="' + planet.spriteSize + '" ');
        image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(sized);

        return planet;
    }

    // turns the bodies that turn, returning true if any of them was in view to be repainted
    function spinPlanets(elapsedMs) {
        var scrollY = window.scrollY;
        var spun = false;

        for (var i = 0; i < planets.length; i++) {
            var planet = planets[i];
            if (!planet.paint || (planet.fall && planet.fall.eaten)) continue;

            var y = planet.fall ? hole.y + planet.fall.y : planet.y - scrollY * planet.speed;
            if (y < -planet.size || y > field.clientHeight + planet.size) continue;

            planet.spin += (ENDURANCE_SPIN_RATE * elapsedMs) / 1000;
            planet.paint(planet.spriteCtx, planet.spriteSize, planet.spin);
            planet.pixels = null;
            planet.drawn = null;
            spun = true;
        }

        return spun;
    }

    function drawSpinningPlanets() {
        var scrollY = window.scrollY;
        for (var i = 0; i < planets.length; i++) {
            if (planets[i].paint) drawPlanet(planets[i], -scrollY * planets[i].speed);
        }
    }

    // `drawn` remembers what the canvas holds, to save redrawing an unchanged planet
    function drawPlainPlanet(planet, scale, presence) {
        var key = scale.toFixed(3) + "/" + presence.toFixed(3);
        if (planet.drawn === key) return;

        var size = planet.spriteSize * scale;
        var corner = planet.pad * planet.dpr + (planet.spriteSize - size) / 2;
        planet.ctx.clearRect(0, 0, planet.canvas.width, planet.canvas.height);
        planet.ctx.globalAlpha = presence;
        planet.ctx.drawImage(planet.sprite, corner, corner, size, size);
        planet.ctx.globalAlpha = 1;
        planet.drawn = key;
    }

    function blankPlanet(planet) {
        if (planet.drawn === "blank") return;
        planet.ctx.clearRect(0, 0, planet.canvas.width, planet.canvas.height);
        planet.drawn = "blank";
    }

    // works the lens backwards: each pixel of the image asks which point of the
    // planet it shows, which for a point mass is θ(1 - E²/|θ|²) relative to the
    // hole. that naturally yields both the bent primary image and the
    // counter-image inside the einstein ring
    function drawLensedPlanet(planet, holeX, holeY, scale, presence) {
        var dpr = planet.dpr;
        var half = planet.size / 2;
        var offset = half + planet.pad;
        var canvasSize = planet.canvas.width;
        var spriteSize = planet.spriteSize;
        // the sprite's pixels are read back only when there is bending to do
        var pixels = planet.pixels || (planet.pixels = planet.spriteCtx.getImageData(0, 0, spriteSize, spriteSize).data);
        var data = planet.output.data;
        var shadowRadius = SHADOW_RADIUS * hole.mass;
        var einsteinSquared = EINSTEIN_RADIUS * EINSTEIN_RADIUS * hole.mass;

        // only the pixels that can hold an image are worth visiting
        var primaryReach = (half * scale + EINSTEIN_RADIUS + 4) * dpr;
        var counterReach = (EINSTEIN_RADIUS + 4) * dpr;
        var centre = canvasSize / 2;
        var holeCanvasX = centre + holeX * dpr;
        var holeCanvasY = centre + holeY * dpr;
        var x0 = Math.max(0, Math.floor(Math.min(centre - primaryReach, holeCanvasX - counterReach)));
        var x1 = Math.min(canvasSize, Math.ceil(Math.max(centre + primaryReach, holeCanvasX + counterReach)));
        var y0 = Math.max(0, Math.floor(Math.min(centre - primaryReach, holeCanvasY - counterReach)));
        var y1 = Math.min(canvasSize, Math.ceil(Math.max(centre + primaryReach, holeCanvasY + counterReach)));

        data.fill(0);

        for (var py = y0; py < y1; py++) {
            var thetaY = (py + 0.5) / dpr - offset - holeY;

            for (var px = x0; px < x1; px++) {
                var thetaX = (px + 0.5) / dpr - offset - holeX;
                var thetaSquared = thetaX * thetaX + thetaY * thetaY;
                var theta = Math.sqrt(thetaSquared);

                if (theta < shadowRadius) continue;

                var strength = 1 - smoothstep(LENS_FULL_RADIUS, LENS_END_RADIUS, theta);
                var bend = 1 - Math.pow(Math.sqrt(einsteinSquared * strength) / theta, PLANET_LENS_SHARPNESS + 1);
                var sx = ((holeX + thetaX * bend) / scale + half) * dpr - 0.5;
                var sy = ((holeY + thetaY * bend) / scale + half) * dpr - 0.5;

                if (sx < 0 || sy < 0 || sx > spriteSize - 1 || sy > spriteSize - 1) continue;

                // bilinear sample, weighting colour by alpha so edges don't fringe dark
                var sx0 = Math.floor(sx);
                var sy0 = Math.floor(sy);
                var sx1 = Math.min(sx0 + 1, spriteSize - 1);
                var sy1 = Math.min(sy0 + 1, spriteSize - 1);
                var fx = sx - sx0;
                var fy = sy - sy0;
                var w00 = (1 - fx) * (1 - fy);
                var w10 = fx * (1 - fy);
                var w01 = (1 - fx) * fy;
                var w11 = fx * fy;
                var i00 = (sy0 * spriteSize + sx0) * 4;
                var i10 = (sy0 * spriteSize + sx1) * 4;
                var i01 = (sy1 * spriteSize + sx0) * 4;
                var i11 = (sy1 * spriteSize + sx1) * 4;
                var a00 = pixels[i00 + 3] * w00;
                var a10 = pixels[i10 + 3] * w10;
                var a01 = pixels[i01 + 3] * w01;
                var a11 = pixels[i11 + 3] * w11;
                var alpha = a00 + a10 + a01 + a11;

                if (alpha < 1) continue;

                var fade = smoothstep(shadowRadius, shadowRadius + GHOST_FADE_PX, theta);
                var o = (py * canvasSize + px) * 4;
                data[o] = (pixels[i00] * a00 + pixels[i10] * a10 + pixels[i01] * a01 + pixels[i11] * a11) / alpha;
                data[o + 1] = (pixels[i00 + 1] * a00 + pixels[i10 + 1] * a10 + pixels[i01 + 1] * a01 + pixels[i11 + 1] * a11) / alpha;
                data[o + 2] = (pixels[i00 + 2] * a00 + pixels[i10 + 2] * a10 + pixels[i01 + 2] * a01 + pixels[i11 + 2] * a11) / alpha;
                data[o + 3] = alpha * fade * presence;
            }
        }

        planet.ctx.putImageData(planet.output, 0, 0);
        planet.drawn = null;
    }

    function drawPlanet(planet, parallaxY) {
        // where the planet's centre is: falling into the hole, flying home, or at rest
        var centreX = planet.x;
        var centreY = planet.y + parallaxY;
        var scale = 1;
        var presence = 1;

        if (planet.fall) {
            centreX = hole.x + planet.fall.x;
            centreY = hole.y + planet.fall.y;
            scale = 1 - planet.digested;
            presence = planet.fall.eaten ? 0 : 1;
        } else if (planet.release) {
            var left = releaseLeft(planet.release);
            centreX += planet.release.offsetX * left;
            centreY += planet.release.offsetY * left;
            scale = 1 - planet.release.digested * left;
            presence = releasePresence(planet.release);
        }

        planet.el.style.transform = "translate(" + (centreX - planet.x).toFixed(2) + "px, " + (centreY - planet.y).toFixed(2) + "px)";
        if (!planet.ready) return;

        if (presence <= 0 || scale <= 0.01) {
            blankPlanet(planet);
            return;
        }

        // the hole's position relative to the planet's centre
        var holeX = hole.x - centreX;
        var holeY = hole.y - centreY;
        var reach = planet.size / 2 + LENS_END_RADIUS;

        if (hole.mass <= 0 || holeX * holeX + holeY * holeY > reach * reach) {
            drawPlainPlanet(planet, scale, presence);
            return;
        }

        drawLensedPlanet(planet, holeX, holeY, scale, presence);
    }

    // the faces of the endurance that can be seen with the wheel turned to
    // `spin` degrees, sorted for painting back to front
    function enduranceFaces(spin) {
        var sinE = ENDURANCE_ELEVATION;
        var cosE = Math.sqrt(1 - sinE * sinE);
        var faces = [];

        function add(a, b, scale) {
            return [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale];
        }

        function dot(a, b) {
            return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        }

        // the wheel lies in the x-y plane with its axle along z. we look from in
        // front and above, lit from over the left shoulder
        var towardsUs = [0, cosE, sinE];
        var light = add(add([-0.55, 0, 0], [0, -sinE, cosE], 0.6), towardsUs, 0.58);

        function project(point) {
            return [point[0], point[1] * sinE - point[2] * cosE];
        }

        // a box sitting at `angle` round the wheel, `distance` out from the axle,
        // sized along the radius, round the rim and along the axle
        function addBox(angle, distance, radial, around, axial, tone) {
            var radians = ((angle + spin) * Math.PI) / 180;
            var axes = [[Math.cos(radians), Math.sin(radians), 0], [-Math.sin(radians), Math.cos(radians), 0], [0, 0, 1]];
            var halves = [radial / 2, around / 2, axial / 2];
            var centre = add([0, 0, 0], axes[0], distance);

            for (var a = 0; a < 3; a++) {
                for (var side = -1; side <= 1; side += 2) {
                    var normal = add([0, 0, 0], axes[a], side);
                    if (dot(normal, towardsUs) <= 0) continue;

                    var b = (a + 1) % 3;
                    var c = (a + 2) % 3;
                    var middle = add(centre, normal, halves[a]);
                    var shade = Math.min(tone * (0.32 + 0.85 * Math.max(0, dot(normal, light))), 1.1);

                    faces.push({
                        depth: dot(middle, towardsUs),
                        points: [
                            project(add(add(middle, axes[b], halves[b]), axes[c], halves[c])),
                            project(add(add(middle, axes[b], halves[b]), axes[c], -halves[c])),
                            project(add(add(middle, axes[b], -halves[b]), axes[c], -halves[c])),
                            project(add(add(middle, axes[b], -halves[b]), axes[c], halves[c]))
                        ],
                        colour:
                            "rgb(" +
                            ENDURANCE_HULL.map(function (channel) {
                                return Math.min(Math.round(channel * shade), 255);
                            }).join(",") +
                            ")"
                    });
                }
            }
        }

        var i;

        // the two tunnels from the hub out to the wheel
        addBox(0, 0.5, 0.74, 0.06, 0.06, 0.75);
        addBox(180, 0.5, 0.74, 0.06, 0.06, 0.75);

        // the hub, and the four craft docked around it
        addBox(0, 0, 0.26, 0.26, 0.28, 0.9);
        for (i = 0; i < 4; i++) {
            addBox(45 + i * 90, 0.27, 0.22, 0.13, 0.1, 1.05);
        }

        // the wheel: twelve modules, every third an engine, joined by short tunnels
        for (i = 0; i < 12; i++) {
            addBox(i * 30, 1, 0.26, 0.4, 0.22, i % 3 === 0 ? 0.72 : 1);
            addBox(i * 30 + 15, 1, 0.12, 0.2, 0.1, 0.8);
        }

        return faces.sort(function (a, b) {
            return a.depth - b.depth;
        });
    }

    function paintEndurance(ctx, size, spin) {
        var faces = enduranceFaces(spin);
        var scale = size / (ENDURANCE_EXTENT * 2);

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, size, size);
        ctx.translate(size / 2, size / 2);
        ctx.rotate((ENDURANCE_ROLL * Math.PI) / 180);
        ctx.scale(scale, scale);
        ctx.lineWidth = 0.008;
        ctx.lineJoin = "round";

        for (var i = 0; i < faces.length; i++) {
            var points = faces[i].points;
            ctx.beginPath();
            ctx.moveTo(points[0][0], points[0][1]);
            for (var p = 1; p < points.length; p++) {
                ctx.lineTo(points[p][0], points[p][1]);
            }
            ctx.closePath();

            // the outline, in the face's own colour, closes the hairline gaps between faces
            ctx.fillStyle = ctx.strokeStyle = faces[i].colour;
            ctx.fill();
            ctx.stroke();
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    function buildMars() {
        var r = PLANET_RADIUS;
        var extent = r + 4;
        var markings = "";

        for (var i = 0; i < MARS_MARKINGS.length; i++) {
            var m = MARS_MARKINGS[i];
            markings +=
                '<ellipse cx="' + m.x * r + '" cy="' + m.y * r + '" rx="' + m.rx * r + '" ry="' + m.ry * r + '" transform="rotate(' + m.rotate + " " + m.x * r + " " + m.y * r + ')" fill="#5a1a08" opacity="' + m.opacity + '"/>';
        }

        var svg =
            '<svg viewBox="' + -extent + " " + -extent + " " + extent * 2 + " " + extent * 2 + '">' +
            "<defs>" +
            '<radialGradient id="mars-globe" cx="0.36" cy="0.3" r="0.72">' +
            '<stop offset="0" stop-color="#ffd9b8"/>' +
            '<stop offset="0.4" stop-color="#ee8a4e"/>' +
            '<stop offset="0.78" stop-color="#9c3a15"/>' +
            '<stop offset="1" stop-color="#2e0c04"/>' +
            "</radialGradient>" +
            '<clipPath id="mars-globe-clip"><circle r="' + r + '"/></clipPath>' +
            '<filter id="mars-soften"><feGaussianBlur stdDeviation="1.5"/></filter>' +
            "</defs>" +
            '<circle r="' + r + '" fill="url(#mars-globe)"/>' +
            '<g clip-path="url(#mars-globe-clip)" filter="url(#mars-soften)">' + markings +
            // a polar ice cap, tilted a little towards us
            '<ellipse cx="' + -r * 0.08 + '" cy="' + -r * 0.9 + '" rx="' + r * 0.3 + '" ry="' + r * 0.13 + '" fill="#fff4ea" opacity="0.65"/>' +
            "</g>" +
            "</svg>";

        return svg;
    }

    function buildSaturn() {
        var r = PLANET_RADIUS;
        var extent = RING_BANDS[RING_BANDS.length - 1].to * r + 4;
        var rings = "";
        var ringOutline = "";
        var i;

        for (i = 0; i < RING_BANDS.length; i++) {
            rings += '<path d="' + ringPath(RING_BANDS[i]) + '" fill="url(#planet-ring)" fill-rule="evenodd" opacity="' + RING_BANDS[i].opacity + '"/>';
            ringOutline += '<path d="' + ringPath(RING_BANDS[i]) + '" clip-rule="evenodd"/>';
        }

        var latitudes = "";
        for (i = 0; i < PLANET_BANDS.length; i++) {
            var band = PLANET_BANDS[i];
            latitudes += '<path d="' + latitudePath(band) + '" fill="none" stroke="#8a4a1c" stroke-width="' + band.width + '" opacity="' + band.opacity + '"/>';
        }

        var svg =
            '<svg viewBox="' + -extent + " " + -extent + " " + extent * 2 + " " + extent * 2 + '">' +
            "<defs>" +
            '<radialGradient id="planet-globe" cx="0.36" cy="0.3" r="0.72">' +
            '<stop offset="0" stop-color="#fff0cc"/>' +
            '<stop offset="0.45" stop-color="#f3c67c"/>' +
            '<stop offset="0.8" stop-color="#b5712c"/>' +
            '<stop offset="1" stop-color="#3a2310"/>' +
            "</radialGradient>" +
            '<linearGradient id="planet-ring" x1="0" y1="0" x2="1" y2="0">' +
            '<stop offset="0" stop-color="#b8863f"/>' +
            '<stop offset="0.35" stop-color="#fbe0aa"/>' +
            '<stop offset="0.7" stop-color="#ecc282"/>' +
            '<stop offset="1" stop-color="#a06e33"/>' +
            "</linearGradient>" +
            '<clipPath id="planet-far"><rect x="' + -extent + '" y="' + -extent + '" width="' + extent * 2 + '" height="' + extent + '"/></clipPath>' +
            '<clipPath id="planet-near"><rect x="' + -extent + '" y="0" width="' + extent * 2 + '" height="' + extent + '"/></clipPath>' +
            '<clipPath id="planet-globe-clip"><circle r="' + r + '"/></clipPath>' +
            '<clipPath id="planet-rings">' + ringOutline + "</clipPath>" +
            '<filter id="planet-soften"><feGaussianBlur stdDeviation="2"/></filter>' +
            "</defs>" +
            '<g transform="rotate(' + RING_ANGLE + ')">' +
            // the far side of the rings, with the planet's shadow falling across them
            '<g clip-path="url(#planet-far)">' + rings +
            '<g clip-path="url(#planet-rings)">' +
            '<circle cx="' + r * 0.3 + '" cy="' + -r * 0.1 + '" r="' + r * 1.12 + '" fill="#1B1E21" opacity="0.8" filter="url(#planet-soften)"/>' +
            "</g></g>" +
            '<circle r="' + r + '" fill="url(#planet-globe)"/>' +
            '<g clip-path="url(#planet-globe-clip)">' + latitudes + "</g>" +
            '<g clip-path="url(#planet-near)">' + rings + "</g>" +
            "</g>" +
            "</svg>";

        return svg;
    }

    function lensTransform(x, y, angle, squash, stretch) {
        var transform = "translate(" + x.toFixed(2) + "px, " + y.toFixed(2) + "px)";
        if (stretch > 1.01 || squash < 0.99) {
            // after rotating, the star's x axis points away from the hole
            transform += " rotate(" + angle.toFixed(3) + "rad) scale(" + squash.toFixed(3) + ", " + stretch.toFixed(3) + ")";
        }
        return transform;
    }

    // how far an image is smeared around the hole. the true factor is the ratio of
    // the two distances, exaggerated so that the streaks read at the size of a star
    function stretchFor(imageDistance, distance) {
        return Math.min(Math.pow(imageDistance / distance, STRETCH_EXAGGERATION), MAX_STRETCH);
    }

    function hideGhost(star) {
        if (!star.ghostVisible) return;
        star.ghost.style.setProperty("--star-opacity-scale", 0);
        star.ghostVisible = false;
    }

    function setStarOpacity(star, opacity) {
        var text = opacity.toFixed(3);
        if (text === star.opacityText) return;
        star.el.style.setProperty("--star-opacity-scale", text);
        star.opacityText = text;
    }

    // stars hold steady while in the hole's pull, picking their twinkle back up once free
    function setStarSteady(star, steady) {
        if (star.steady === steady) return;
        star.el.style.animationPlayState = steady ? "paused" : "";
        star.steady = steady;
    }

    // how much of a released body's journey home is left, easing as it arrives
    function releaseLeft(release) {
        return release.left * release.left * release.left;
    }

    function releasePresence(release) {
        return release.presence + (1 - release.presence) * (1 - release.left);
    }

    function unlensStar(star, x, y, presence) {
        star.el.style.transform = x ? "translate(" + x.toFixed(2) + "px, " + y.toFixed(2) + "px)" : "translateY(" + y + "px)";
        hideGhost(star);
        setStarOpacity(star, star.opacityScale * presence);
        setStarSteady(star, presence < 1);
    }

    // a star on its way into the hole, drawn as a streak along its path
    function drawFallingStar(star) {
        var fall = star.fall;
        hideGhost(star);
        setStarSteady(star, true);

        if (fall.eaten) {
            setStarOpacity(star, 0);
            return;
        }

        var speed = Math.sqrt(fall.vx * fall.vx + fall.vy * fall.vy);
        star.el.style.transform = lensTransform(
            hole.x + fall.x - star.x,
            hole.y + fall.y - star.y,
            Math.atan2(fall.vy, fall.vx) + Math.PI / 2,
            1,
            Math.min(1 + speed / FEED_STREAK_SPEED, MAX_STRETCH)
        );
        setStarOpacity(star, star.opacityScale * fallPresence(fall));
    }

    // where the hole moves something sitting at (x, y), or null when it is out of the pull
    function lensAt(x, y) {
        var dx = x - hole.x;
        var dy = y - hole.y;
        var distance = Math.max(Math.sqrt(dx * dx + dy * dy), 0.5);
        var strength = hole.mass * (1 - smoothstep(LENS_FULL_RADIUS, LENS_END_RADIUS, distance));

        if (strength <= 0) return null;

        var einsteinSquared = EINSTEIN_RADIUS * EINSTEIN_RADIUS * strength;
        var root = Math.sqrt(distance * distance + 4 * einsteinSquared);

        return {
            distance: distance,
            root: root,
            imageDistance: (distance + root) / 2,
            ghostDistance: (root - distance) / 2,
            unitX: dx / distance,
            unitY: dy / distance,
            angle: Math.atan2(dy, dx)
        };
    }

    function drawStar(star, parallaxY) {
        if (star.fall) {
            drawFallingStar(star);
            return;
        }

        // a released star flies home from wherever the hole let go of it
        var offsetX = 0;
        var offsetY = 0;
        var presence = 1;

        if (star.release) {
            var left = releaseLeft(star.release);
            offsetX = star.release.offsetX * left;
            offsetY = star.release.offsetY * left;
            presence = releasePresence(star.release);
        }

        var lens = hole.mass > 0 ? lensAt(star.x, star.y + parallaxY) : null;

        if (!lens) {
            unlensStar(star, offsetX, parallaxY + offsetY, presence);
            return;
        }

        var distance = lens.distance;
        var root = lens.root;
        var imageDistance = lens.imageDistance;
        var ghostDistance = lens.ghostDistance;
        var unitX = lens.unitX;
        var unitY = lens.unitY;
        var angle = lens.angle;
        var push = imageDistance - distance;

        // lensing magnifies as well as distorts, so stars brighten as they near the ring
        var magnification = imageDistance / distance;

        star.el.style.transform = lensTransform(
            offsetX + push * unitX,
            offsetY + parallaxY + push * unitY,
            angle,
            1,
            stretchFor(imageDistance, distance)
        );
        setStarOpacity(star, Math.min(star.opacityScale * magnification, MAX_BRIGHTNESS) * presence);
        setStarSteady(star, true);

        if (star.release) {
            hideGhost(star);
            return;
        }

        // the second image sits inside the einstein ring, opposite the star,
        // and is swallowed once it falls into the hole's shadow
        var ghostStretch = ghostDistance / distance;
        var ghostSquash = (1 - distance / root) / 2;
        var shadowRadius = SHADOW_RADIUS * hole.mass;
        var ghostOpacity =
            Math.min(ghostStretch * ghostSquash, 1) * smoothstep(shadowRadius, shadowRadius + GHOST_FADE_PX, ghostDistance);

        if (ghostOpacity < 0.02) {
            hideGhost(star);
            return;
        }

        if (!star.ghost) {
            star.ghost = star.el.cloneNode(false);
            field.appendChild(star.ghost);
        }

        var pull = -(distance + ghostDistance);
        star.ghost.style.transform = lensTransform(
            pull * unitX,
            parallaxY + pull * unitY,
            angle,
            Math.max(ghostSquash, MIN_SQUASH),
            stretchFor(ghostDistance, distance)
        );
        star.ghost.style.setProperty("--star-opacity-scale", (ghostOpacity * star.opacityScale).toFixed(3));
        star.ghostVisible = true;
    }

    // a body the feeding hole has caught, tracked relative to the hole. it starts
    // from where it was seen, moving sideways so that it spirals in
    function startFall(x, y) {
        var distance = Math.max(Math.sqrt(x * x + y * y), 1);
        return {
            x: x,
            y: y,
            vx: (-y / distance) * FEED_SWIRL,
            vy: (x / distance) * FEED_SWIRL,
            distance: distance,
            eaten: false
        };
    }

    // something the hole finished off before this page was built
    function eatenFall() {
        var fall = startFall(0, 0);
        fall.eaten = true;
        return fall;
    }

    function stepFall(fall, dt, drag) {
        var distance = Math.max(fall.distance, 1);
        var pull = FEED_PULL / Math.max(distance, FEED_PULL_FLOOR);
        var slow = Math.exp(-drag * dt);

        fall.vx = (fall.vx - (fall.x / distance) * pull * dt) * slow;
        fall.vy = (fall.vy - (fall.y / distance) * pull * dt) * slow;
        fall.x += fall.vx * dt;
        fall.y += fall.vy * dt;
        fall.distance = Math.sqrt(fall.x * fall.x + fall.y * fall.y);
    }

    // falling bodies fade out as they cross into the shadow
    function fallPresence(fall) {
        return fall.eaten ? 0 : smoothstep(SHADOW_RADIUS, SHADOW_RADIUS + FEED_FADE_PX, fall.distance);
    }

    // where the hole currently shows something that sits at (x, y), relative to the hole
    function caughtAt(x, y) {
        var lens = lensAt(x, y);
        var bend = lens ? lens.imageDistance / lens.distance : 1;
        return startFall((x - hole.x) * bend, (y - hole.y) * bend);
    }

    // advances the feast and any flights home, returning true while there is more to come
    function stepFeeding(elapsedMs) {
        var dt = elapsedMs / 1000;
        var scrollY = window.scrollY;
        var busy = false;
        var i, x, y, dx, dy;

        if (hole.pinned) hole.front += FEED_FRONT_SPEED * dt;

        for (i = 0; i < stars.length; i++) {
            var star = stars[i];

            if (star.fall) {
                if (star.fall.eaten) continue;
                stepFall(star.fall, dt, FEED_DRAG);
                if (star.fall.distance < SHADOW_RADIUS) star.fall.eaten = true;
                busy = true;
            } else if (hole.pinned) {
                x = star.x;
                y = star.y - scrollY * star.speed;
                dx = x - hole.x;
                dy = y - hole.y;
                if (dx * dx + dy * dy < hole.front * hole.front) star.fall = caughtAt(x, y);
                busy = true;
            } else if (star.release) {
                star.release.left -= dt / RELEASE_S;
                if (star.release.left <= 0) star.release = null;
                busy = true;
            }
        }

        for (i = 0; i < planets.length; i++) {
            var planet = planets[i];

            if (planet.fall) {
                if (planet.fall.eaten) continue;

                // once within the ring a planet settles onto the hole and is slowly consumed
                var digesting = planet.fall.distance < EINSTEIN_RADIUS;
                stepFall(planet.fall, dt, digesting ? PLANET_DIGEST_DRAG : FEED_DRAG);
                if (digesting) planet.digested = Math.min(planet.digested + dt / PLANET_DIGEST_S, 1);
                if (planet.digested >= 1) planet.fall.eaten = true;
                busy = true;
            } else if (hole.pinned) {
                x = planet.x;
                y = planet.y - scrollY * planet.speed;
                dx = x - hole.x;
                dy = y - hole.y;
                if (dx * dx + dy * dy < hole.front * hole.front) planet.fall = startFall(dx, dy);
                busy = true;
            } else if (planet.release) {
                planet.release.left -= dt / RELEASE_S;
                if (planet.release.left <= 0) planet.release = null;
                busy = true;
            }
        }

        if (hole.pinned && !busy && !devoured) {
            devoured = true;
            storeShowStars(false);
        }

        return busy;
    }

    function pinHole(pageX, pageY) {
        hole.pinned = true;
        hole.pageX = pageX;
        hole.pageY = pageY;
        hole.front = 0;
    }

    // lets go of everything the hole has caught or eaten, and returns the hole to the mouse
    function releaseHole(x, y) {
        var scrollY = window.scrollY;
        var i;

        for (i = 0; i < stars.length; i++) {
            var star = stars[i];
            if (!star.fall) continue;

            star.release = {
                offsetX: hole.x + (star.fall.eaten ? 0 : star.fall.x) - star.x,
                offsetY: hole.y + (star.fall.eaten ? 0 : star.fall.y) - (star.y - scrollY * star.speed),
                presence: fallPresence(star.fall),
                left: 1
            };
            star.fall = null;
        }

        for (i = 0; i < planets.length; i++) {
            var planet = planets[i];
            if (!planet.fall) continue;

            planet.release = {
                offsetX: hole.x + planet.fall.x - planet.x,
                offsetY: hole.y + planet.fall.y - (planet.y - scrollY * planet.speed),
                presence: planet.fall.eaten ? 0 : 1,
                digested: planet.digested,
                left: 1
            };
            planet.fall = null;
            planet.digested = 0;
        }

        hole.pinned = false;
        hole.targetX = x;
        hole.targetY = y;

        devoured = false;
        storeShowStars(true);
    }

    function draw() {
        var scrollY = window.scrollY;

        for (var i = 0; i < stars.length; i++) {
            drawStar(stars[i], -scrollY * stars[i].speed);
        }

        for (var p = 0; p < planets.length; p++) {
            drawPlanet(planets[p], -scrollY * planets[p].speed);
        }
    }

    // the stars drift off the top of the screen as the page scrolls
    function shareOfStarsOnScreen() {
        var scrollY = window.scrollY;
        var onScreen = 0;

        for (var i = 0; i < stars.length; i++) {
            if (stars[i].y - scrollY * stars[i].speed > 0) onScreen++;
        }

        return stars.length ? onScreen / stars.length : 0;
    }

    // eases the hole towards the mouse, returning true once it has come to rest
    function moveHole(elapsedMs) {
        if (hole.pinned) {
            // a pinned hole belongs to the page, and scrolls with it
            hole.x = hole.targetX = hole.pageX - window.scrollX;
            hole.y = hole.targetY = hole.pageY - window.scrollY;
            hole.targetMass = 1;
        } else {
            hole.targetMass = hole.summoned ? smoothstep(HOLE_GONE_STAR_SHARE, HOLE_FULL_STAR_SHARE, shareOfStarsOnScreen()) : 0;
        }

        var follow = 1 - Math.exp(-elapsedMs / HOLE_FOLLOW_MS);
        var grow = 1 - Math.exp(-elapsedMs / HOLE_GROW_MS);

        hole.x += (hole.targetX - hole.x) * follow;
        hole.y += (hole.targetY - hole.y) * follow;
        hole.mass += (hole.targetMass - hole.mass) * grow;

        var resting =
            Math.abs(hole.targetX - hole.x) < 0.1 &&
            Math.abs(hole.targetY - hole.y) < 0.1 &&
            Math.abs(hole.targetMass - hole.mass) < 0.002;

        if (resting) {
            hole.x = hole.targetX;
            hole.y = hole.targetY;
            hole.mass = hole.targetMass;
        }

        return resting;
    }

    var frameRequested = false;
    var lastFrameTime = 0;

    var redrawNeeded = false;

    function requestFrame() {
        redrawNeeded = true;
        requestTick();
    }

    // the loop keeps running while the hole is settling or feeding, a satellite
    // is in flight, or something in view is turning
    function requestTick() {
        if (frameRequested) return;
        frameRequested = true;
        requestAnimationFrame(function (now) {
            frameRequested = false;

            var elapsedMs = lastFrameTime ? Math.min(now - lastFrameTime, 50) : 16;
            var resting = moveHole(elapsedMs);
            var feeding = stepFeeding(elapsedMs);
            var spun = spinPlanets(elapsedMs);

            if (!resting || feeding || redrawNeeded) {
                draw();
                redrawNeeded = false;
            } else if (spun) {
                drawSpinningPlanets();
            }

            moveSatellite(elapsedMs);

            if (resting && !feeding && !satellite && !spun) {
                lastFrameTime = 0;
            } else {
                lastFrameTime = now;
                requestTick();
            }
        });
    }

    function onPointerMove(event) {
        if (event.pointerType === "touch" || hole.pinned) return;

        hole.targetX = event.clientX;
        hole.targetY = event.clientY;

        // a hole that has fully evaporated reappears under the mouse rather than flying to it
        if (hole.mass === 0) {
            hole.x = hole.targetX;
            hole.y = hole.targetY;
        }

        hole.summoned = true;
        requestFrame();
    }

    function onPointerLeave() {
        hole.summoned = false;
        requestFrame();
    }

    // things a click is meant for, which should not also move the hole
    var CLICKABLE =
        "a, button, input, textarea, select, label, summary, video, audio, img, picture, svg, canvas, iframe, embed, object, hr, [role='button'], [contenteditable], [tabindex]";

    function textUnderPoint(el, x, y) {
        var range = document.createRange();

        for (var node = el.firstChild; node; node = node.nextSibling) {
            if (node.nodeType !== 3 || !node.nodeValue.trim()) continue;

            range.selectNodeContents(node);
            var rects = range.getClientRects();
            for (var i = 0; i < rects.length; i++) {
                if (x >= rects[i].left && x <= rects[i].right && y >= rects[i].top && y <= rects[i].bottom) return true;
            }
        }

        return false;
    }

    // empty space is anywhere a click would otherwise do nothing: not on a link,
    // an image, a video or the like, and not on a run of text
    function isEmptySpace(event) {
        var target = event.target;
        if (!target || !target.closest || target.closest(CLICKABLE)) return false;
        if (window.getComputedStyle(target).cursor === "pointer") return false;
        return !textUnderPoint(target, event.clientX, event.clientY);
    }

    function selectedText() {
        var selection = window.getSelection();
        return selection && !selection.isCollapsed ? selection.toString() : "";
    }

    var pressedOnTouch = false;
    var pressedWithText = "";

    function onPointerDown(event) {
        pressedOnTouch = event.pointerType === "touch";
        pressedWithText = selectedText();
    }

    // a click on empty space pins the hole there to feed, and the next lets everything go
    function onClick(event) {
        // a press that ends with newly selected text was a selection, not a click.
        // one that merely clears a selection, or leaves it alone, still counts
        var text = selectedText();
        var selecting = text !== "" && text !== pressedWithText;
        if (pressedOnTouch || selecting || event.button !== 0 || !isEmptySpace(event)) return;

        if (hole.pinned) {
            releaseHole(event.clientX, event.clientY);
        } else {
            pinHole(event.pageX, event.pageY);
        }

        hole.summoned = true;
        requestFrame();
    }

    var SHOOTING_MIN_DELAY_MS = 4000;
    var SHOOTING_MAX_DELAY_MS = 10000;

    function spawnShootingStar() {
        var shootingStar = document.createElement("div");
        shootingStar.className = "shooting-star";

        var startLeft = random(10, 70);
        var startTop = random(10, 80);
        var distance = random(150, 320);
        var direction = Math.random() < 0.5 ? -1 : 1;
        var dx = distance * direction;
        var dy = random(-0.12, 0.12) * distance;
        var duration = random(0.3, 0.5);

        shootingStar.style.left = startLeft + "%";
        shootingStar.style.top = startTop + "%";
        shootingStar.style.setProperty("--shooting-dx", dx + "px");
        shootingStar.style.setProperty("--shooting-dy", dy + "px");
        shootingStar.style.setProperty("--shooting-duration", duration + "s");

        field.appendChild(shootingStar);

        setTimeout(function () {
            shootingStar.remove();
        }, duration * 1000 + 100);
    }

    function scheduleShootingStar() {
        var delay = random(SHOOTING_MIN_DELAY_MS, SHOOTING_MAX_DELAY_MS);
        setTimeout(function () {
            spawnShootingStar();
            scheduleShootingStar();
        }, delay);
    }

    // a satellite crawls right across the screen, waiting a while between passes.
    // unlike the stars it is a real body: the hole's gravity bends its course,
    // and straying inside the shadow is the end of it
    var SATELLITE_MIN_GAP_MS = 10000;
    var SATELLITE_MAX_GAP_MS = 15000;
    var SATELLITE_MIN_DURATION_S = 10;
    var SATELLITE_MAX_DURATION_S = 16;
    var SATELLITE_MARGIN = 20;
    var SATELLITE_FADE_PX = 60;
    var SATELLITE_OPACITY = 0.75;
    var SATELLITE_PULL = 1000000; // px³/s², sized so a close pass swings it round
    var SATELLITE_SOFTENING = 12;
    var SATELLITE_MAX_SPEED = 700;
    var SATELLITE_SWALLOW_S = 0.45;

    var satellite = null;

    function spawnSatellite() {
        var el = document.createElement("div");
        el.className = "satellite";

        var width = field.clientWidth;
        var height = field.clientHeight;
        var leftToRight = Math.random() < 0.5;
        var startX = leftToRight ? -SATELLITE_MARGIN : width + SATELLITE_MARGIN;
        var endX = leftToRight ? width + SATELLITE_MARGIN : -SATELLITE_MARGIN;
        var startY = random(height * 0.05, height * 0.95);
        var endY = random(height * 0.05, height * 0.95);
        var duration = random(SATELLITE_MIN_DURATION_S, SATELLITE_MAX_DURATION_S);

        satellite = {
            el: el,
            x: startX,
            y: startY,
            vx: (endX - startX) / duration,
            vy: (endY - startY) / duration,
            age: 0,
            swallowed: 0,
            fall: null
        };

        field.appendChild(el);
        requestTick();
    }

    function removeSatellite() {
        satellite.el.remove();
        satellite = null;
        scheduleSatellite();
    }

    function moveSatellite(elapsedMs) {
        if (!satellite) return;

        var s = satellite;
        var dt = elapsedMs / 1000;
        s.age += dt;

        if (s.swallowed) {
            // spiral the last of it into the hole
            s.swallowed += dt;
            var gone = Math.min(s.swallowed / SATELLITE_SWALLOW_S, 1);
            s.x += (hole.x - s.x) * gone;
            s.y += (hole.y - s.y) * gone;
            s.el.style.opacity = SATELLITE_OPACITY * (1 - gone);
            s.el.style.transform = "translate(" + s.x.toFixed(2) + "px, " + s.y.toFixed(2) + "px) scale(" + (1 - gone).toFixed(3) + ")";
            if (gone >= 1) removeSatellite();
            return;
        }

        // a feeding hole takes the satellite like everything else, once its pull has spread that far
        if (hole.pinned && !s.fall) {
            var offX = s.x - hole.x;
            var offY = s.y - hole.y;
            var off = Math.sqrt(offX * offX + offY * offY);
            if (off < hole.front) s.fall = { x: offX, y: offY, vx: s.vx, vy: s.vy, distance: off, eaten: false };
        } else if (!hole.pinned && s.fall) {
            // let go mid-fall, it carries on from wherever it had got to
            s.fall = null;
        }

        if (s.fall) {
            stepFall(s.fall, dt, FEED_DRAG);
            s.x = hole.x + s.fall.x;
            s.y = hole.y + s.fall.y;
            s.vx = s.fall.vx;
            s.vy = s.fall.vy;

            if (s.fall.distance < SHADOW_RADIUS) {
                s.swallowed = 0.0001;
                return;
            }
        } else if (hole.mass > 0) {
            var dx = hole.x - s.x;
            var dy = hole.y - s.y;
            var distanceSquared = dx * dx + dy * dy;
            var distance = Math.sqrt(distanceSquared);

            if (distance < SHADOW_RADIUS * hole.mass) {
                s.swallowed = 0.0001;
                return;
            }

            var reach = 1 - smoothstep(LENS_FULL_RADIUS, LENS_END_RADIUS, distance);
            var pull = (SATELLITE_PULL * hole.mass * reach) / (distanceSquared + SATELLITE_SOFTENING * SATELLITE_SOFTENING);
            s.vx += ((pull * dx) / distance) * dt;
            s.vy += ((pull * dy) / distance) * dt;

            var speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
            if (speed > SATELLITE_MAX_SPEED) {
                s.vx *= SATELLITE_MAX_SPEED / speed;
                s.vy *= SATELLITE_MAX_SPEED / speed;
            }
        }

        if (!s.fall) {
            s.x += s.vx * dt;
            s.y += s.vy * dt;
        }

        var width = field.clientWidth;
        var height = field.clientHeight;
        var edge = Math.min(s.x, width - s.x, s.y, height - s.y);

        if (!s.fall && s.age > 1 && edge < -SATELLITE_MARGIN) {
            removeSatellite();
            return;
        }

        // fades in and out at the edges of the screen
        var visible = Math.min(Math.max((edge + SATELLITE_MARGIN) / (SATELLITE_FADE_PX + SATELLITE_MARGIN), 0), 1);
        s.el.style.opacity = SATELLITE_OPACITY * visible;
        s.el.style.transform = "translate(" + s.x.toFixed(2) + "px, " + s.y.toFixed(2) + "px)";
    }

    function scheduleSatellite() {
        setTimeout(spawnSatellite, random(SATELLITE_MIN_GAP_MS, SATELLITE_MAX_GAP_MS));
    }

    // a sky eaten on an earlier page stays that way, the hole waiting mid-screen
    if (devoured) pinHole(window.scrollX + field.clientWidth / 2, window.scrollY + field.clientHeight / 2);

    buildStars();

    if (!reduceMotion) {
        window.addEventListener("scroll", requestFrame, { passive: true });
        window.addEventListener("pointermove", onPointerMove, { passive: true });
        document.documentElement.addEventListener("pointerleave", onPointerLeave);
        document.addEventListener("pointerdown", onPointerDown, { passive: true });
        document.addEventListener("click", onClick);
        scheduleShootingStar();
        scheduleSatellite();
        requestTick();
    }

    var resizeTimer;
    window.addEventListener("resize", function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(buildStars, RESIZE_DEBOUNCE_MS);
    });
})();
