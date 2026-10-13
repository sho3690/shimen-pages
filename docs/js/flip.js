/* 面をめくる。2026-10-13 に「フリップで捲れるように」との依頼で追加。

   今の面が左端を背にして本のページのように回り、次の面が下から現れる。
   前の面へ戻るときは、前の面が左から回って重なってくる（行きと帰りで同じ道を通る）。

   - 指: 左右のスワイプ。指に1:1でついてくる。離したときの速さで、めくり切るか戻るかを決める
         （ゆっくりなら半分近くまで動かしたかどうか）。動いている途中でつかみ直せる
   - パソコン: タブ・「次の面へ」・← → キー・トラックパッドの横スワイプ
   - 最初・最後の面では、少しだけ引っぱれて戻る（行き止まりを固い壁にしない）
   - 縦のスクロールとピンチ拡大は邪魔しない（CSSの touch-action: pan-y pinch-zoom）
   - 「視差効果を減らす」設定では、動かさずに切り替える

   動きは臨界減衰のばね（行き過ぎない）。離した指の速さをばねの初速に引き継ぐ。 */
(function () {
  "use strict";

  const RESPONSE = 0.4;          // ばねの応答（秒）。小さいほどきびきび
  const PERSPECTIVE = 1400;      // 奥行き（px）
  const DECIDE_DISTANCE = 10;    // 縦か横かを決めるまでの遊び（px）
  const COMMIT_SPEED = 0.6;      // 1秒に面の幅の0.6倍より速く払えば、距離が短くてもめくる
  const COMMIT_SHARE = 0.4;      // ゆっくりなら、幅の4割を越えたらめくる

  let active = null;             // いま画面にある紙面（描き直すたびに差し替わる）
  let stage = null;              // めくっている最中の状態
  let drag = null;               // 指の追跡
  let suppressClick = false;     // めくった直後の「指を離したクリック」を記事リンクに渡さない
  let wheel = { sum: 0, locked: false, timer: null };

  function reduced() {
    return !!(window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function currentIndex() {
    return active ? active.panels.findIndex(function (p) { return !p.hidden; }) : -1;
  }

  /* 行き止まりで引っぱったときの手応え。引くほど重くなる */
  function rubberband(over, size) {
    const c = 0.55;
    return (over * size * c) / (size + c * Math.abs(over));
  }

  /* ===== ばね（臨界減衰。行き過ぎない） ===== */

  let raf = 0;

  function stopSpring() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function spring(from, to, velocity, onFrame, onDone) {
    stopSpring();
    const k = Math.pow((2 * Math.PI) / RESPONSE, 2);
    const c = (4 * Math.PI) / RESPONSE;   // 減衰比 1.0
    let x = from;
    let v = velocity;
    let last = performance.now();

    function step(now) {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const h = dt / 4;
      for (let i = 0; i < 4; i++) {
        v += (-k * (x - to) - c * v) * h;
        x += v * h;
      }
      if (Math.abs(x - to) < 0.0005 && Math.abs(v) < 0.01) {
        raf = 0;
        onFrame(to);
        onDone();
        return;
      }
      onFrame(x);
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
  }

  /* ===== めくりの舞台 ===== */

  /* 進み具合 t は 0（めくる前）〜 1（めくり終わり）。
     前へ: 今の面が 0° → -90° に回る。端が指の位置に来るよう acos で角度を出す
     後へ: 前の面が -90° → 0° に回って重なる */
  function render(t) {
    const s = stage;
    const tt = clamp(t, 0, 1);
    const rad = s.dir > 0 ? Math.acos(1 - tt) : Math.acos(tt);
    const deg = -(rad * 180) / Math.PI;
    s.mover.style.transform = "perspective(" + PERSPECTIVE + "px) rotateY(" + deg.toFixed(2) + "deg)";
    // 回るほど影が濃くなる（立てたページに光が当たらなくなる）
    s.mover.style.setProperty("--flip-shade", (0.28 * (rad / (Math.PI / 2))).toFixed(3));
    s.t = t;
  }

  function openStage(from, to, dir) {
    const panels = active.panels;
    const cur = panels[from];
    const inc = panels[to];
    const rect = cur.getBoundingClientRect();
    const scrollY = window.scrollY || window.pageYOffset;

    // めくった後の置き場所。面の頭が画面の上に隠れていたら、タブが見える位置へ戻す。
    // 次の面は、めくり終わったときと同じ高さに最初から置いておく（着地で跳ねない）
    let targetScroll = null;
    let top = rect.top;
    if (rect.top < 0) {
      const tabsTop = active.tabsNode.getBoundingClientRect().top + scrollY;
      targetScroll = Math.max(0, tabsTop - 16);
      top = rect.top + scrollY - targetScroll;
    }

    inc.hidden = false;
    inc.classList.add("panel--stage");
    inc.style.top = top + "px";
    inc.style.left = rect.left + "px";
    inc.style.width = rect.width + "px";
    inc.style.height = Math.max(0, window.innerHeight - top) + "px";

    const mover = dir > 0 ? cur : inc;
    mover.classList.add("panel--turning");
    // 回転の軸は面の左端。奥行きの中心は、いま見えている高さの真ん中に置く
    const originY = dir > 0 ? window.innerHeight / 2 - rect.top : (window.innerHeight - top) / 2;
    mover.style.transformOrigin = "0 " + originY.toFixed(0) + "px";
    inc.style.zIndex = dir > 0 ? "1" : "3";
    if (dir > 0) cur.style.zIndex = "2";

    stage = {
      from: from, to: to, dir: dir, cur: cur, inc: inc, mover: mover,
      width: rect.width, targetScroll: targetScroll, t: 0,
    };
    render(0);
  }

  function closeStage(committed, done) {
    const s = stage;
    stage = null;
    [s.cur, s.inc].forEach(function (p) {
      p.classList.remove("panel--stage", "panel--turning");
      ["transform", "transformOrigin", "top", "left", "width", "height", "zIndex"].forEach(function (k) {
        p.style[k] = "";
      });
      p.style.removeProperty("--flip-shade");
    });
    if (committed) {
      active.tabsNode.select(s.to, false);
      if (s.targetScroll !== null) window.scrollTo(0, s.targetScroll);
    } else {
      s.inc.hidden = true;
    }
    if (done) done();
  }

  function settle(commit, velocity, done) {
    const s = stage;
    spring(s.t, commit ? 1 : 0, velocity, render, function () { closeStage(commit, done); });
  }

  /* タブ・ボタン・キー・トラックパッドから。指は使わず、ばねだけでめくる */
  function turnTo(index, done) {
    if (!active || stage || drag) return;
    const from = currentIndex();
    if (index === from || index < 0 || index >= active.panels.length) return;
    if (reduced()) {
      active.tabsNode.select(index, false);
      const top = active.tabsNode.getBoundingClientRect().top;
      if (top < 0) window.scrollTo(0, top + window.scrollY - 16);
      if (done) done();
      return;
    }
    openStage(from, index, index > from ? 1 : -1);
    settle(true, 0, done);
  }

  /* 行き止まりで引っぱったとき、面を少しだけ横にずらす */
  function nudge(panel, x) {
    panel.style.transform = x ? "translateX(" + x.toFixed(1) + "px)" : "";
  }

  /* ===== 指 ===== */

  function onPointerDown(e) {
    if (!active || e.pointerType === "mouse" || !e.isPrimary || drag) return;
    const panel = e.currentTarget;
    drag = {
      id: e.pointerId, panel: panel, x0: e.clientX, y0: e.clientY,
      decided: false, mode: null, base: 0, history: [],
    };
    // めくっている最中に触れたら、その場でつかみ直す（動きを止めて指に戻す）
    if (stage) {
      stopSpring();
      drag.decided = true;
      drag.mode = "turn";
      drag.base = stage.t;
      panel.setPointerCapture(e.pointerId);
      suppressClick = true;
    }
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    const now = performance.now();
    drag.history.push([now, e.clientX]);
    while (drag.history.length > 2 && now - drag.history[0][0] > 100) drag.history.shift();

    if (!drag.decided) {
      if (Math.hypot(dx, dy) < DECIDE_DISTANCE) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) {   // 縦の読み進め。何もしない
        drag = null;
        return;
      }
      drag.decided = true;
      suppressClick = true;
      drag.panel.setPointerCapture(e.pointerId);
      const from = currentIndex();
      const to = from + (dx < 0 ? 1 : -1);
      if (to < 0 || to >= active.panels.length) {
        drag.mode = "edge";
      } else if (reduced()) {
        drag.mode = "instant";   // 動かさず、離したときに切り替える
        drag.to = to;
      } else {
        drag.mode = "turn";
        openStage(from, to, dx < 0 ? 1 : -1);
        drag.base = 0;
      }
      drag.x0 = e.clientX;   // ここからの動きを1:1でつなぐ
      return;
    }

    const moved = e.clientX - drag.x0;
    drag.moved = moved;
    if (drag.mode === "instant") return;
    if (drag.mode === "edge") {
      if (!reduced()) nudge(active.panels[currentIndex()], rubberband(moved, window.innerWidth));
      return;
    }
    const s = stage;
    if (!s) return;
    render(clamp(drag.base + (s.dir > 0 ? -moved : moved) / s.width, 0, 1));
  }

  function releaseVelocity(d) {
    const h = (d || drag).history;
    if (h.length < 2) return 0;
    const a = h[0];
    const b = h[h.length - 1];
    const dt = (b[0] - a[0]) / 1000;
    return dt > 0 ? (b[1] - a[1]) / dt : 0;   // px/秒。右向きが正
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.decided) return;
    setTimeout(function () { suppressClick = false; }, 0);

    if (d.mode === "instant") {
      if (e.type !== "pointercancel" &&
          (Math.abs(d.moved || 0) > 48 || Math.abs(releaseVelocity(d)) > 300)) {
        turnTo(d.to);
      }
      return;
    }
    if (d.mode === "edge") {
      if (reduced()) return;
      const panel = active.panels[currentIndex()];
      const m = new DOMMatrixReadOnly(getComputedStyle(panel).transform);
      spring(m.m41, 0, 0, function (x) { nudge(panel, x); }, function () { nudge(panel, 0); });
      return;
    }
    const s = stage;
    if (!s) return;
    // 速さ（面の幅/秒）。めくる向きを正にそろえる
    const v = ((s.dir > 0 ? -1 : 1) * releaseVelocity(d)) / s.width;
    const commit = e.type === "pointercancel"
      ? false
      : Math.abs(v) > COMMIT_SPEED ? v > 0 : s.t > COMMIT_SHARE;
    settle(commit, v, null);
  }

  /* ===== キーボードとトラックパッド（紙面ごとではなく、1回だけ付ける） ===== */

  function typingIn(target) {
    return !!(target && target.closest &&
      target.closest("input, textarea, select, [contenteditable], [role=tab], [role=menu], .sheet"));
  }

  document.addEventListener("keydown", function (e) {
    if (!active || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    if (typingIn(e.target)) return;
    const next = currentIndex() + (e.key === "ArrowRight" ? 1 : -1);
    if (next < 0 || next >= active.panels.length) return;
    e.preventDefault();
    turnTo(next);
  });

  // 2本指の横スワイプ（Macのトラックパッド）。指が離れて止まるまでに1回だけめくる
  document.addEventListener("wheel", function (e) {
    if (!active || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    if (typingIn(e.target)) return;
    clearTimeout(wheel.timer);
    wheel.timer = setTimeout(function () { wheel.sum = 0; wheel.locked = false; }, 250);
    if (wheel.locked) return;
    wheel.sum += e.deltaX;
    if (Math.abs(wheel.sum) < 60) return;
    wheel.locked = true;
    const next = currentIndex() + (wheel.sum > 0 ? 1 : -1);
    if (next >= 0 && next < active.panels.length) turnTo(next);
  }, { passive: true });

  // めくった直後に指を離した場所の記事リンクが開かないようにする
  document.addEventListener("click", function (e) {
    if (!suppressClick) return;
    e.preventDefault();
    e.stopPropagation();
    suppressClick = false;
  }, true);

  function attach(tabsNode, panels) {
    stopSpring();
    stage = null;
    drag = null;
    if (!panels || panels.length < 2) {
      active = null;
      return;
    }
    active = { tabsNode: tabsNode, panels: panels };
    tabsNode.turnTo = turnTo;
    panels.forEach(function (panel) {
      panel.addEventListener("pointerdown", onPointerDown);
      panel.addEventListener("pointermove", onPointerMove);
      panel.addEventListener("pointerup", onPointerUp);
      panel.addEventListener("pointercancel", onPointerUp);
    });
  }

  window.Flip = { attach: attach };
})();
