(function () {
    var field = document.getElementById("star-field");
    if (!field) return;

    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var COLUMNS = 20;
    var ROWS = 14;
    var MIN_SIZE = 1;
    var MAX_SIZE = 2;
    var MIN_SPEED = 0.2;
    var MAX_SPEED = 1;
    var RESIZE_DEBOUNCE_MS = 200;

    var layers = [];

    function random(min, max) {
        return min + Math.random() * (max - min);
    }

    function buildStars() {
        field.innerHTML = "";
        layers = [];

        var cellWidthPercent = 100 / COLUMNS;
        var cellHeightPercent = 100 / ROWS;

        for (var row = 0; row < ROWS; row++) {
            for (var col = 0; col < COLUMNS; col++) {
                var star = document.createElement("div");
                star.className = "star";

                var xPercent = col * cellWidthPercent + random(cellWidthPercent * 0.15, cellWidthPercent * 0.85);
                var yPercent = row * cellHeightPercent + random(cellHeightPercent * 0.15, cellHeightPercent * 0.85);
                var size = random(MIN_SIZE, MAX_SIZE);

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
                    layers.push({ el: star, speed: random(MIN_SPEED, MAX_SPEED) });
                }
            }
        }

        applyParallax();
    }

    function applyParallax() {
        var scrollY = window.scrollY;
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            layer.el.style.transform = "translateY(" + -scrollY * layer.speed + "px)";
        }
    }

    var ticking = false;
    function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
            applyParallax();
            ticking = false;
        });
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
        window.addEventListener("scroll", onScroll, { passive: true });
        scheduleShootingStar();
    }

    var resizeTimer;
    window.addEventListener("resize", function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(buildStars, RESIZE_DEBOUNCE_MS);
    });
})();
