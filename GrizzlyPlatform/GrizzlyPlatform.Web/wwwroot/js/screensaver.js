(() => {
  const run = () => {
    const logo = document.querySelector('.screensaver-logo');
    if (!logo || logo.dataset.bouncing) return;
    logo.dataset.bouncing = '1';
    let x = Math.random() * Math.max(1, innerWidth - logo.offsetWidth);
    let y = Math.random() * Math.max(1, innerHeight - logo.offsetHeight);
    let vx = (Math.random() > .5 ? 1 : -1) * (75 + Math.random() * 25);
    let vy = (Math.random() > .5 ? 1 : -1) * (75 + Math.random() * 25);
    let last = performance.now();
    const tick = now => {
      if (!document.body.contains(logo)) return;
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      const maxX = Math.max(0, innerWidth - logo.offsetWidth);
      const maxY = Math.max(0, innerHeight - logo.offsetHeight);
      x += vx * dt; y += vy * dt;
      if (x <= 0) { x = 0; vx = Math.abs(vx); }
      if (x >= maxX) { x = maxX; vx = -Math.abs(vx); }
      if (y <= 0) { y = 0; vy = Math.abs(vy); }
      if (y >= maxY) { y = maxY; vy = -Math.abs(vy); }
      logo.style.left = `${x}px`; logo.style.top = `${y}px`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  new MutationObserver(run).observe(document.body, {childList:true, subtree:true});
})();


