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

    var stars = [];
    var planets = [];
    var hole = { x: 0, y: 0, targetX: 0, targetY: 0, mass: 0, targetMass: 0, summoned: false };

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
                        lensed: false,
                        x: (xPercent / 100) * fieldWidth + size / 2,
                        y: (yPercent / 100) * fieldHeight + size / 2,
                        speed: random(MIN_SPEED, MAX_SPEED),
                        opacityScale: opacityScale
                    });
                }
            }
        }

        planets = [makePlanet("saturn", buildSaturn(), SATURN_SPEED), makePlanet("mars", buildMars(), MARS_SPEED)];

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

    // a planet is rasterised once from its svg into a sprite, then drawn on a
    // canvas each frame so that the hole can bend it pixel by pixel
    function makePlanet(name, svg, speed) {
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
            sprite: null,
            pixels: null,
            output: null,
            plain: false
        };

        var image = new Image();
        image.onload = function () {
            var sprite = document.createElement("canvas");
            sprite.width = sprite.height = planet.spriteSize;
            var spriteContext = sprite.getContext("2d");
            spriteContext.drawImage(image, 0, 0, planet.spriteSize, planet.spriteSize);
            planet.sprite = sprite;
            planet.pixels = spriteContext.getImageData(0, 0, planet.spriteSize, planet.spriteSize).data;
            planet.output = planet.ctx.createImageData(canvas.width, canvas.height);
            requestFrame();
        };
        var sized = svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="' + planet.spriteSize + '" height="' + planet.spriteSize + '" ');
        image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(sized);

        return planet;
    }

    function drawPlainPlanet(planet) {
        planet.ctx.clearRect(0, 0, planet.canvas.width, planet.canvas.height);
        planet.ctx.drawImage(planet.sprite, planet.pad * planet.dpr, planet.pad * planet.dpr);
        planet.plain = true;
    }

    // works the lens backwards: each pixel of the image asks which point of the
    // planet it shows, which for a point mass is θ(1 - E²/|θ|²) relative to the
    // hole. that naturally yields both the bent primary image and the
    // counter-image inside the einstein ring
    function drawLensedPlanet(planet, holeX, holeY) {
        var dpr = planet.dpr;
        var half = planet.size / 2;
        var offset = half + planet.pad;
        var canvasSize = planet.canvas.width;
        var spriteSize = planet.spriteSize;
        var pixels = planet.pixels;
        var data = planet.output.data;
        var shadowRadius = SHADOW_RADIUS * hole.mass;
        var einsteinSquared = EINSTEIN_RADIUS * EINSTEIN_RADIUS * hole.mass;

        // only the pixels that can hold an image are worth visiting
        var primaryReach = (half + EINSTEIN_RADIUS + 4) * dpr;
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
                var sx = (holeX + thetaX * bend + half) * dpr - 0.5;
                var sy = (holeY + thetaY * bend + half) * dpr - 0.5;

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
                data[o + 3] = alpha * fade;
            }
        }

        planet.ctx.putImageData(planet.output, 0, 0);
        planet.plain = false;
    }

    function drawPlanet(planet, parallaxY) {
        planet.el.style.transform = "translateY(" + parallaxY + "px)";
        if (!planet.pixels) return;

        // the hole's position relative to the planet's centre
        var holeX = hole.x - planet.x;
        var holeY = hole.y - (planet.y + parallaxY);
        var reach = planet.size / 2 + LENS_END_RADIUS;

        if (hole.mass <= 0 || holeX * holeX + holeY * holeY > reach * reach) {
            if (!planet.plain) drawPlainPlanet(planet);
            return;
        }

        drawLensedPlanet(planet, holeX, holeY);
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

    function unlensStar(star, parallaxY) {
        star.el.style.transform = "translateY(" + parallaxY + "px)";
        hideGhost(star);

        if (star.lensed) {
            star.el.style.setProperty("--star-opacity-scale", star.opacityScale);
            star.el.style.animationPlayState = "";
            star.lensed = false;
        }
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

    function lensStar(star, parallaxY) {
        var lens = lensAt(star.x, star.y + parallaxY);

        if (!lens) {
            unlensStar(star, parallaxY);
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

        star.el.style.transform = lensTransform(push * unitX, parallaxY + push * unitY, angle, 1, stretchFor(imageDistance, distance));
        star.el.style.setProperty("--star-opacity-scale", Math.min(star.opacityScale * magnification, MAX_BRIGHTNESS).toFixed(3));

        // stars hold steady while in the hole's pull, picking their twinkle back up once free
        if (!star.lensed) {
            star.el.style.animationPlayState = "paused";
            star.lensed = true;
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

    function draw() {
        var scrollY = window.scrollY;
        var lensing = hole.mass > 0;

        for (var i = 0; i < stars.length; i++) {
            var star = stars[i];
            var parallaxY = -scrollY * star.speed;

            if (lensing) {
                lensStar(star, parallaxY);
            } else {
                unlensStar(star, parallaxY);
            }
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
        hole.targetMass = hole.summoned ? smoothstep(HOLE_GONE_STAR_SHARE, HOLE_FULL_STAR_SHARE, shareOfStarsOnScreen()) : 0;

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

    // the loop keeps running while the hole is settling or a satellite is in flight
    function requestTick() {
        if (frameRequested) return;
        frameRequested = true;
        requestAnimationFrame(function (now) {
            frameRequested = false;

            var elapsedMs = lastFrameTime ? Math.min(now - lastFrameTime, 50) : 16;
            var resting = moveHole(elapsedMs);

            if (!resting || redrawNeeded) {
                draw();
                redrawNeeded = false;
            }

            moveSatellite(elapsedMs);

            if (resting && !satellite) {
                lastFrameTime = 0;
            } else {
                lastFrameTime = now;
                requestTick();
            }
        });
    }

    function onPointerMove(event) {
        if (event.pointerType === "touch") return;

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
            swallowed: 0
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

        if (hole.mass > 0) {
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

        s.x += s.vx * dt;
        s.y += s.vy * dt;

        var width = field.clientWidth;
        var height = field.clientHeight;
        var edge = Math.min(s.x, width - s.x, s.y, height - s.y);

        if (s.age > 1 && edge < -SATELLITE_MARGIN) {
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

    buildStars();

    if (!reduceMotion) {
        window.addEventListener("scroll", requestFrame, { passive: true });
        window.addEventListener("pointermove", onPointerMove, { passive: true });
        document.documentElement.addEventListener("pointerleave", onPointerLeave);
        scheduleShootingStar();
        scheduleSatellite();
    }

    var resizeTimer;
    window.addEventListener("resize", function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(buildStars, RESIZE_DEBOUNCE_MS);
    });
})();
