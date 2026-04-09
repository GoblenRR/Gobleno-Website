(() => {
  const transitionDuration = 420;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const isInternalPageLink = (link) => {
    if (!link.href) return false;
    if (link.target && link.target !== "_self") return false;
    if (link.hasAttribute("download")) return false;

    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) return false;
    if (url.pathname === window.location.pathname && (!url.hash || url.hash === window.location.hash)) {
      return false;
    }

    return true;
  };

  const startEntry = () => {
    document.body.classList.add("is-entering");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.body.classList.add("is-loaded");
        window.setTimeout(() => {
          document.body.classList.remove("is-entering");
        }, transitionDuration);
      });
    });
  };

  if (reducedMotion) {
    document.body.classList.add("is-loaded");
  } else {
    startEntry();
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link || reducedMotion || !isInternalPageLink(link)) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    document.body.classList.add("is-transitioning");

    window.setTimeout(() => {
      window.location.href = link.href;
    }, transitionDuration);
  });

  window.addEventListener("pageshow", () => {
    document.body.classList.remove("is-transitioning");
  });
})();
