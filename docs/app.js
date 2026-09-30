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
    // E is the einstein radius, with a fainter second image on the far side of the hole
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

    var stars = [];
    var hole = { el: null, x: 0, y: 0, targetX: 0, targetY: 0, mass: 0, targetMass: 0, summoned: false };

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

        if (!reduceMotion) {
            hole.el = document.createElement("div");
            hole.el.className = "black-hole";
            hole.el.style.width = SHADOW_RADIUS * 2 + "px";
            hole.el.style.height = SHADOW_RADIUS * 2 + "px";
            hole.el.style.margin = -SHADOW_RADIUS + "px 0 0 " + -SHADOW_RADIUS + "px";
            field.appendChild(hole.el);
        }

        draw();
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

    function lensStar(star, parallaxY) {
        var dx = star.x - hole.x;
        var dy = star.y + parallaxY - hole.y;
        var distance = Math.max(Math.sqrt(dx * dx + dy * dy), 0.5);
        var strength = hole.mass * (1 - smoothstep(LENS_FULL_RADIUS, LENS_END_RADIUS, distance));

        if (strength <= 0) {
            unlensStar(star, parallaxY);
            return;
        }

        var einsteinSquared = EINSTEIN_RADIUS * EINSTEIN_RADIUS * strength;
        var root = Math.sqrt(distance * distance + 4 * einsteinSquared);
        var imageDistance = (distance + root) / 2;
        var ghostDistance = (root - distance) / 2;

        var unitX = dx / distance;
        var unitY = dy / distance;
        var angle = Math.atan2(dy, dx);
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

        if (hole.el) {
            hole.el.style.opacity = hole.mass;
            hole.el.style.transform = "translate(" + hole.x.toFixed(2) + "px, " + hole.y.toFixed(2) + "px) scale(" + hole.mass.toFixed(3) + ")";
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

    function requestFrame() {
        if (frameRequested) return;
        frameRequested = true;
        requestAnimationFrame(function (now) {
            frameRequested = false;

            var elapsedMs = lastFrameTime ? Math.min(now - lastFrameTime, 50) : 16;
            var resting = moveHole(elapsedMs);
            draw();

            if (resting) {
                lastFrameTime = 0;
            } else {
                lastFrameTime = now;
                requestFrame();
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

    buildStars();

    if (!reduceMotion) {
        window.addEventListener("scroll", requestFrame, { passive: true });
        window.addEventListener("pointermove", onPointerMove, { passive: true });
        document.documentElement.addEventListener("pointerleave", onPointerLeave);
        scheduleShootingStar();
    }

    var resizeTimer;
    window.addEventListener("resize", function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(buildStars, RESIZE_DEBOUNCE_MS);
    });
})();
