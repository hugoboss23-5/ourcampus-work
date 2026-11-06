// built-from: native IntersectionObserver, HTML dialog and media queries (MDN); Three.js r160 module loaded progressively.
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const menu = $("#menu"),
  toggle = $(".menu-toggle");
let menuWasFocused = null;
function closeMenu() {
  menu.hidden = true;
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Open menu");
  document.body.style.overflow = "";
  document.body.classList.remove("menu-open");
}
toggle.addEventListener("click", () => {
  if (!menu.hidden) {
    closeMenu();
    toggle.focus();
    return;
  }
  menuWasFocused = document.activeElement;
  menu.hidden = false;
  toggle.setAttribute("aria-expanded", "true");
  toggle.setAttribute("aria-label", "Close menu");
  document.body.style.overflow = "hidden";
  document.body.classList.add("menu-open");
  menu.querySelector("a").focus();
});
menu
  .querySelectorAll("a")
  .forEach((a) => a.addEventListener("click", closeMenu));
document.addEventListener("keydown", (e) => {
  if (menu.hidden) return;
  if (e.key === "Escape") {
    closeMenu();
    toggle.focus();
  }
  if (e.key === "Tab") {
    const list = [toggle, ...menu.querySelectorAll("a")],
      first = list[0],
      last = list.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
const sections = $$("section[data-name]"),
  chapter = $("#chapterLabel"),
  indicator = $(".chapter-indicator");
const observer = new IntersectionObserver(
  () => {
    const current =
      sections
        .filter((s) => s.getBoundingClientRect().top < innerHeight * 0.45)
        .at(-1) || sections[0];
    chapter.textContent = current.dataset.name;
    indicator.classList.toggle("visible", scrollY > innerHeight * 0.65);
  },
  { rootMargin: "-30% 0px -45% 0px", threshold: 0 },
);
sections.forEach((s) => observer.observe(s));

const scenes = [
  ["01 / 03", "Light in every dimension.", "assets/img/prod-versa.webp"],
  ["02 / 03", "A bigger stage.", "assets/img/sport-smoke.webp"],
  ["03 / 03", "Room for bigger ideas.", "assets/img/corp-corner.webp"],
];
let display = null,
  sceneIndex = 0;
$$("[data-scene]").forEach((button) =>
  button.addEventListener("click", () => {
    sceneIndex = Number(button.dataset.scene);
    $$("[data-scene]").forEach((b) => {
      b.classList.toggle("active", b === button);
      b.setAttribute("aria-pressed", String(b === button));
    });
    $("#sceneIndex").textContent = scenes[sceneIndex][0];
    $("#sceneName").textContent = scenes[sceneIndex][1];
    $(".stage-fallback").src = scenes[sceneIndex][2];
    display?.setScene(sceneIndex);
  }),
);
if (!new URLSearchParams(location.search).has("still")) {
  import("./screen.js")
    .then(({ createDisplay }) => {
      display = createDisplay($("#display"), $("#stage"), reduced);
      if (display) {
        $("#stage").classList.add("has-webgl");
        display.setScene(sceneIndex);
        window.__display = display;
      } else {
        $("#renderMode").hidden = false;
        $("#stageHint").hidden = true;
      }
    })
    .catch(() => {
      $("#renderMode").hidden = false;
      $("#stageHint").hidden = true;
    });
} else {
  $("#renderMode").hidden = false;
  $("#stageHint").hidden = true;
}

const products = [
  {
    name: "Krystl",
    type: "Indoor / high resolution",
    img: "krystl",
    description:
      "Picture-perfect, even up close. Our high-resolution LED range for spaces where every detail matters.",
    specs: [
      ["Pixel pitch from", "0.4 mm"],
      ["Brightness up to", "1,800 nits"],
    ],
    url: "krystl",
  },
  {
    name: "Dura",
    type: "Outdoor / weather resistant",
    img: "dura",
    description:
      "Built to shine in the elements. High-brightness LED for outdoor spaces and demanding environments.",
    specs: [
      ["Pixel pitch from", "1.9 mm"],
      ["Protection up to", "IP67"],
    ],
    url: "dura",
  },
  {
    name: "Versa",
    type: "Versatile / everyday impact",
    img: "versa",
    description:
      "Punchy performance for retail, transport and visitor spaces. Seamless displays that make every message count.",
    specs: [
      ["Pixel pitch from", "2.5 mm"],
      ["Brightness up to", "6,000 nits"],
    ],
    url: "versa",
  },
  {
    name: "Artist",
    type: "Bespoke / custom shapes",
    img: "artist",
    description:
      "Set your imagination free. A fully customisable LED platform for shapes and spaces beyond the ordinary.",
    specs: [
      ["Design", "Bespoke"],
      ["Warranty up to", "10 years"],
    ],
    url: "artist",
  },
  {
    name: "IMPAKT",
    type: "Sport / perimeter displays",
    img: "impakt",
    description:
      "Big matchday impact, with player safety in mind. Perimeter LED with impact-reducing components.",
    specs: [
      ["Pixel pitch from", "8 mm"],
      ["Brightness up to", "8,000 nits"],
    ],
    url: "impakt",
  },
  {
    name: "Bendac LIVE!",
    type: "Software / sports production",
    img: "live",
    description:
      "Run the show. Matchday production software for multiple inputs, stadium screens and scheduled advertising.",
    specs: [
      ["Camera inputs", "Up to 4"],
      ["Licence", "Lifetime"],
    ],
    url: "live",
  },
];
$$("[data-product]").forEach((button) =>
  button.addEventListener("click", () => {
    const p = products[Number(button.dataset.product)];
    $$("[data-product]").forEach((b) => {
      b.classList.toggle("active", b === button);
      b.setAttribute("aria-pressed", String(b === button));
    });
    $("#productImage").src = `assets/img/prod-${p.img}.webp`;
    $("#productImage").alt = `${p.name} LED solution`;
    $("#productType").textContent = p.type;
    $("#productName").textContent = p.name;
    $("#productDescription").textContent = p.description;
    $("#productSpecs").replaceChildren(
      ...p.specs.map(([label, value]) => {
        const d = document.createElement("div"),
          dt = document.createElement("dt"),
          dd = document.createElement("dd");
        dt.textContent = label;
        dd.textContent = value;
        d.append(dt, dd);
        return d;
      }),
    );
    $("#productLink").href = `https://www.bendac.tech/${p.url}`;
    $("#productLink").innerHTML = `Explore ${p.name} <span>↗</span>`;
    button.scrollIntoView({
      behavior: reduced ? "instant" : "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }),
);

const instructions = {
  iPhone: "Open Control Centre.<br>Choose Screen Mirroring.",
  iPad: "Open Control Centre.<br>Choose Screen Mirroring.",
  Mac: "Open Control Centre.<br>Choose Screen Mirroring.",
  Android: "Open Quick Settings.<br>Choose Cast or Smart View.",
  Windows: "Press Windows + K.<br>Choose your display.",
};
let sharing = false;
function stopSharing() {
  sharing = false;
  $(".shared-wall").classList.remove("is-sharing");
  $(".share-live").hidden = true;
  $("#sharedImage").src = "assets/img/corp-corner.webp";
  $("#shareButton").innerHTML = "Try sharing <span>↗</span>";
  $("#shareButton").setAttribute("aria-pressed", "false");
}
$("#shareButton").setAttribute("aria-pressed", "false");
$$("[data-device]").forEach((button) =>
  button.addEventListener("click", () => {
    stopSharing();
    $$("[data-device]").forEach((b) => {
      b.classList.toggle("active", b === button);
      b.setAttribute("aria-pressed", String(b === button));
    });
    $("#deviceName").textContent = button.dataset.device;
    $("#deviceInstruction").innerHTML = instructions[button.dataset.device];
  }),
);
$("#shareButton").addEventListener("click", () => {
  if (sharing) {
    stopSharing();
    return;
  }
  sharing = true;
  $("#sharedImage").src = "assets/img/case-google-stairs.webp";
  $(".shared-wall").classList.add("is-sharing");
  $(".share-live").hidden = false;
  $("#shareButton").innerHTML = "Stop sharing <span>×</span>";
  $("#shareButton").setAttribute("aria-pressed", "true");
  if (matchMedia("(max-width:760px)").matches)
    $(".shared-wall").scrollIntoView({
      behavior: reduced ? "instant" : "smooth",
      block: "center",
    });
});
$$(".process details").forEach((detail) =>
  detail.addEventListener("toggle", () => {
    if (detail.open)
      $$(".process details")
        .filter((d) => d !== detail)
        .forEach((d) => (d.open = false));
  }),
);

const dialog = $("#filmDialog");
$$("[data-film]").forEach((button) =>
  button.addEventListener("click", () => {
    const id = button.dataset.film,
      title = button.dataset.title;
    $("#filmTitle").textContent = title;
    $("#youtubeLink").href = `https://www.youtube.com/watch?v=${id}`;
    const frame = document.createElement("iframe");
    frame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
    frame.title = title;
    frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    frame.allowFullscreen = true;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    $("#filmFrame").replaceChildren(frame);
    dialog.showModal();
    document.body.style.overflow = "hidden";
  }),
);
$("#closeFilm").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => {
  $("#filmFrame").replaceChildren();
  document.body.style.overflow = "";
});
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      dialog.close();
  }
});
window.__bendac = { products, scenes, reduced };

if (!reduced) {
  const revealTargets = $$(
    ".project-copy,.range-heading,.people>h2,.work-heading,.film-grid,.intro h2",
  );
  const revealObserver = new IntersectionObserver(
    (es) => {
      es.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in-view");
          revealObserver.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 },
  );
  revealTargets.forEach((el) => {
    el.classList.add("will-reveal");
    revealObserver.observe(el);
  });
  let scrollFrame = 0;
  const projectImages = $$(".project-visual>img");
  const parallax = () => {
    scrollFrame = 0;
    projectImages.forEach((img) => {
      const r = img.parentElement.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      const p = (r.top + r.height * 0.5 - innerHeight * 0.5) / innerHeight;
      img.style.transform = `translateY(${Math.max(-15, Math.min(15, p * 18))}px) scale(1.075)`;
    });
  };
  addEventListener(
    "scroll",
    () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(parallax);
    },
    { passive: true },
  );
}
