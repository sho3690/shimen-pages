/* 紙面のDOM組み立て。
   RSSは外部入力なので innerHTML は一切使わない。textContent のみ。 */
(function () {
  "use strict";

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function relativeTime(iso) {
    if (!iso) return "";
    const then = new Date(iso);
    if (isNaN(then.getTime())) return "";
    const minutes = Math.floor((Date.now() - then.getTime()) / 60000);
    if (minutes < 1) return "たったいま";
    if (minutes < 60) return minutes + "分前";
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + "時間前";
    return Math.floor(hours / 24) + "日前";
  }

  function summaryText(article) {
    if (article.summary_state === "done" && article.summary) return article.summary;
    if (article.excerpt) return article.excerpt;
    if (article.summary_state === "failed") return "要約できませんでした";
    return "要約はまだありません";
  }

  /* 題字まわりは英語（2026-10-14: 「紙面」の題字がださいとの依頼で英語に）。
     2026-10-18: 新聞風のセリフ体・大文字の日付・刊の行が、カードの画面と
     ちぐはぐだとの指摘で、ニュースアプリ（Apple News）の組み方にそろえた。
     アイコンの印＋題字を黒、その下に日付を同じ大きさの灰色で、曜日と本数は小さく1行 */
  const MASTHEAD_TITLE = "Front Page";
  const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];

  /* 「October 18」 */
  function issueDateNode(date) {
    const time = el("time", null, MONTHS_EN[date.getMonth()] + " " + date.getDate());
    time.dateTime = isoDay(date);
    return time;
  }

  /* 機械が読む日付（time要素の datetime）。端末の時刻で数える */
  function isoDay(date) {
    return date.getFullYear() + "-" + ("0" + (date.getMonth() + 1)).slice(-2) + "-" +
      ("0" + date.getDate()).slice(-2);
  }

  function countText(count, one, many) {
    return count + " " + (count === 1 ? one : many);
  }

  /* 「Sunday morning · 60 stories from 11 sources」。朝・夕は15時で切り替える */
  function issueLine(date, total, sourceCount) {
    let text = DAYS_EN[date.getDay()] + (date.getHours() < 15 ? " morning" : " evening");
    if (typeof total === "number") {
      text += " · " + countText(total, "story", "stories");
      if (sourceCount) text += " from " + countText(sourceCount, "source", "sources");
    }
    return text;
  }

  /* ===== 記事の絵 =====
     紙面には記事の写真が無い（ニュースサイトの写真を公開ページに載せると
     著作権の問題になる）。代わりに、見出しから決まる幾何学模様を描く。
     同じ記事はいつも同じ絵になる。飾りなので読み上げない（aria-hidden）。
     色は面ごとに変える: 総合=青と朱、エンタメ=桃と紫、話題=碧と黄 */

  const SVG_NS = "http://www.w3.org/2000/svg";

  const PALETTES = {
    general: ["#3a63f3", "#ff6b4a", "#ffc23d", "#1d2130", "#cfe0ff", "#ffffff"],
    ent: ["#ff5c93", "#7b5cff", "#ffc23d", "#1d2130", "#ffe1ec", "#ffffff"],
    buzz: ["#23b5a6", "#ffc23d", "#ff6b4a", "#3a63f3", "#d3f5ea", "#1d2130"],
  };

  const GENRE_KEYS = { "総合": "general", "エンタメ": "ent", "話題": "buzz" };

  function genreKey(name) { return GENRE_KEYS[name] || "general"; }

  function hashString(text) {   // FNV-1a
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function randomFrom(seed) {   // mulberry32。同じ種なら同じ並び
    let a = seed;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function svgNode(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }

  /* cols×rows のマス目に、円・扇・半円・三角・縞・輪を1つずつ置く */
  function artNode(seedText, genre, cols, rows) {
    const S = 60;
    const colors = PALETTES[genre] || PALETTES.general;
    const rnd = randomFrom(hashString(seedText || "紙面"));
    function pick(avoid) {
      let c = colors[Math.floor(rnd() * colors.length)];
      while (c === avoid) c = colors[Math.floor(rnd() * colors.length)];
      return c;
    }

    const svg = svgNode("svg", {
      class: "art",
      viewBox: "0 0 " + cols * S + " " + rows * S,
      preserveAspectRatio: "xMidYMid slice",
      "aria-hidden": "true",
      focusable: "false",
    });

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const ox = x * S;
        const oy = y * S;
        const bg = pick();
        const fg = pick(bg);
        const turn = 90 * Math.floor(rnd() * 4);
        const cell = svgNode("g", {
          transform: "rotate(" + turn + " " + (ox + S / 2) + " " + (oy + S / 2) + ")",
        });
        // 隣のマスに少しはみ出させて、拡大したときの境目の細い線を消す
        cell.appendChild(svgNode("rect", {
          x: ox - 0.5, y: oy - 0.5, width: S + 1, height: S + 1, fill: bg,
        }));

        const kind = Math.floor(rnd() * 6);
        if (kind === 0) {
          cell.appendChild(svgNode("circle", { cx: ox + S / 2, cy: oy + S / 2, r: S * 0.34, fill: fg }));
        } else if (kind === 1) {
          cell.appendChild(svgNode("path", {
            d: "M" + ox + " " + oy + "H" + (ox + S) + "A" + S + " " + S + " 0 0 1 " + ox + " " + (oy + S) + "Z",
            fill: fg,
          }));
        } else if (kind === 2) {
          cell.appendChild(svgNode("path", {
            d: "M" + ox + " " + (oy + S) + "A" + S / 2 + " " + S / 2 + " 0 0 1 " + (ox + S) + " " + (oy + S) + "Z",
            fill: fg,
          }));
        } else if (kind === 3) {
          cell.appendChild(svgNode("polygon", {
            points: ox + "," + oy + " " + (ox + S) + "," + oy + " " + ox + "," + (oy + S),
            fill: fg,
          }));
        } else if (kind === 4) {
          for (let k = 0; k < 3; k++) {
            cell.appendChild(svgNode("rect", {
              x: ox, y: oy + S * (0.12 + 0.3 * k), width: S, height: S * 0.14, fill: fg,
            }));
          }
        } else {
          cell.appendChild(svgNode("circle", {
            cx: ox + S / 2, cy: oy + S / 2, r: S * 0.26,
            fill: "none", stroke: fg, "stroke-width": S * 0.14,
          }));
        }
        svg.appendChild(cell);
      }
    }
    return svg;
  }

  /* 題字の左の印。ホーム画面のアイコン（icons/icon.svg）と同じ絵を小さく描く。
     影は小さいと見えないので省く。飾りなので読み上げない */
  function brandMark() {
    const svg = svgNode("svg", {
      class: "masthead__mark", viewBox: "0 0 512 512", "aria-hidden": "true", focusable: "false",
    });
    const defs = svgNode("defs", {});
    const outer = svgNode("clipPath", { id: "mark-outer" });
    outer.appendChild(svgNode("rect", { width: 512, height: 512, rx: 116 }));
    const card = svgNode("clipPath", { id: "mark-card" });
    card.appendChild(svgNode("rect", { x: 112, y: 104, width: 288, height: 304, rx: 40 }));
    defs.appendChild(outer);
    defs.appendChild(card);
    svg.appendChild(defs);

    const all = svgNode("g", { "clip-path": "url(#mark-outer)" });
    all.appendChild(svgNode("rect", { width: 512, height: 512, fill: "#3a63f3" }));
    all.appendChild(svgNode("path", { d: "M0 0 H256 A256 256 0 0 1 0 256 Z", fill: "#ff6b4a" }));
    all.appendChild(svgNode("circle", { cx: 420, cy: 420, r: 150, fill: "#ffc23d" }));
    all.appendChild(svgNode("rect", { x: 112, y: 104, width: 288, height: 304, rx: 40, fill: "#ffffff" }));
    const art = svgNode("g", { "clip-path": "url(#mark-card)" });
    art.appendChild(svgNode("rect", { x: 112, y: 104, width: 144, height: 150, fill: "#1d2130" }));
    art.appendChild(svgNode("circle", {
      cx: 184, cy: 179, r: 42, fill: "none", stroke: "#cfe0ff", "stroke-width": 24,
    }));
    art.appendChild(svgNode("rect", { x: 256, y: 104, width: 144, height: 150, fill: "#ffc23d" }));
    art.appendChild(svgNode("path", { d: "M256 104 H400 A144 150 0 0 1 256 254 Z", fill: "#ff6b4a" }));
    all.appendChild(art);
    all.appendChild(svgNode("rect", { x: 148, y: 286, width: 216, height: 30, rx: 10, fill: "#1b1f2a" }));
    all.appendChild(svgNode("rect", { x: 148, y: 332, width: 150, height: 30, rx: 10, fill: "#1b1f2a" }));
    all.appendChild(svgNode("rect", { x: 148, y: 376, width: 84, height: 12, rx: 6, fill: "#c2410c" }));
    svg.appendChild(all);
    return svg;
  }

  function articleNode(article, handlers) {
    const link = el("a", "article");
    link.href = article.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    if (article.is_read) link.classList.add("article--read");

    // 袖見出し。どこの記事かを見出しの前に置く（出典の明示も兼ねる）
    link.appendChild(el("p", "article__kicker", "【" + article.feed_title + "】"));
    link.appendChild(el("h2", "article__title", article.title));
    link.appendChild(el("p", "article__summary", summaryText(article)));

    const source = el("p", "article__source");
    source.textContent = relativeTime(article.published_at) + "／原文を読む ▷";
    link.appendChild(source);

    if (article.body_source === "rss" && article.summary_state === "done") {
      link.appendChild(el("p", "article__note", "抜粋から要約"));
    }

    link.addEventListener("click", function () {
      if (!article.is_read) handlers.onRead(article.id);
    });

    if (article.summary_state === "failed") {
      const retry = el("button", "btn btn--quiet article__retry", "要約をやり直す");
      retry.type = "button";
      retry.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        handlers.onRetry(article.id);
      });
      link.appendChild(retry);
    }
    return link;
  }

  /* 出典。読みたい人だけが開く。件数だけを見せて畳んでおく */
  function sourceList(sources) {
    const wrap = el("details", "sources");
    wrap.appendChild(el("summary", "sources__toggle", "出典 " + sources.length + "件"));
    const list = el("ul", "sources__list");
    sources.forEach(function (s) {
      const item = el("li");
      const link = el("a", "sources__link");
      link.href = s.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.appendChild(el("span", "sources__outlet", s.feed_title));
      link.appendChild(el("span", "sources__title", s.title));
      item.appendChild(link);
      list.appendChild(item);
    });
    wrap.appendChild(list);
    return wrap;
  }

  function storyId(index) { return "story-" + (index + 1); }

  function storyNum(index) { return ("0" + (index + 1)).slice(-2); }

  function seedOf(section) { return section.subtitle || section.text || ""; }

  /* 総括の1段落 = 紙面の1記事。kind は "lead"（紙面のトップ）か "story"。
     トップは上に大きな絵、その上に白い紙を重ねる。
     2026-10-18: ほかの記事の見出しの横の小さな絵は外した（記事の写真が使えないなら
     要らないとの依頼）。分野名の色で、どの面の記事かが分かる。
     id は紙面データの順（サマリーの行が指す番号）、見せる番号は並べた順 */
  function storyNode(section, index, kind, position) {
    const genre = genreKey(section.genre);
    const block = el("article", kind + " card genre--" + genre);
    block.id = storyId(index);

    const kicker = el("p", kind + "__kicker");
    if (section.field) kicker.appendChild(el("span", kind + "__field", section.field));
    kicker.appendChild(el("span", kind + "__num", storyNum(position)));

    const title = section.subtitle ? el("h3", kind + "__title", section.subtitle) : null;

    let body = block;
    if (kind === "lead") {
      const art = el("div", "lead__art");
      art.appendChild(artNode(seedOf(section), genre, 6, 3));
      block.appendChild(art);
      body = el("div", "lead__body");
      block.appendChild(body);
    }
    body.appendChild(kicker);
    if (title) body.appendChild(title);

    body.appendChild(el("p", kind + "__text", section.text));
    if (section.sources && section.sources.length) {
      body.appendChild(sourceList(section.sources));
    }
    return block;
  }

  function scrollToNode(node) {
    const reduce = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }

  /* 記事に着いたことが分かるように、縁を面の色で一度だけ光らせる。
     読み上げとキーボードのために、その記事へフォーカスも移す */
  function arriveAt(node) {
    scrollToNode(node);
    node.tabIndex = -1;
    node.focus({ preventScroll: true });
    node.classList.remove("is-arrived");
    void node.offsetWidth;   // 同じ記事に続けて着いたときも光り直す
    node.classList.add("is-arrived");
    node.addEventListener("animationend", function done() {
      node.classList.remove("is-arrived");
      node.removeEventListener("animationend", done);
    });
  }

  /* きょうのサマリー（2026-10-14〜）。紙面全体から数行の要点。
     記事が分かる行は押せて、その記事まで送る。行の頭の小見出しは、
     記事のカードと同じ分野名（国際・音楽など）。分からない行は面の名前 */
  function briefingNode(points, labelOf, goToStory) {
    const card = el("section", "briefing card");
    card.setAttribute("aria-labelledby", "briefing-title");
    const title = el("h2", "briefing__title", "きょうのサマリー");
    title.id = "briefing-title";
    card.appendChild(title);

    const list = el("ol", "briefing__list");
    points.forEach(function (point) {
      const linked = typeof point.story === "number";
      const row = el(linked ? "a" : "div", "briefing__row");
      if (point.genre) row.classList.add("genre--" + genreKey(point.genre));
      const words = el("span", "briefing__words");
      const label = labelOf(point);
      if (label) words.appendChild(el("span", "briefing__genre", label));
      words.appendChild(el("span", "briefing__text", point.text));
      row.appendChild(words);
      if (linked) {
        row.href = "#" + storyId(point.story);
        row.addEventListener("click", function (event) {
          event.preventDefault();
          goToStory(point.story);
        });
      }
      const item = el("li", "briefing__item");
      item.appendChild(row);
      list.appendChild(item);
    });
    card.appendChild(list);
    return card;
  }

  /* 2026-10-18: 面（総合・エンタメ・話題）に分けず、1本のスクロールで読む。
     面の中の並び（大事な順）は崩さず、面ごとの本数の割合で混ぜる。
     例: 総合8・エンタメ6・話題6 なら 総合・エンタメ・話題・総合・… の順になり、
     先頭（トップ記事）は総合の1本目 */
  function feedOrder(digest) {
    const totals = {};
    const seen = {};
    digest.forEach(function (section) {
      const g = section.genre || "";
      totals[g] = (totals[g] || 0) + 1;
    });
    return digest.map(function (section, index) {
      const g = section.genre || "";
      seen[g] = (seen[g] || 0) + 1;
      return { section: section, index: index, key: (seen[g] - 0.5) / totals[g] };
    }).sort(function (a, b) {
      return a.key - b.key || a.index - b.index;
    });
  }

  /* 記事の一覧。1本目をトップに大きく、残りをカードで並べる */
  function feedNode(items) {
    const feed = el("section", "feed");
    feed.setAttribute("aria-labelledby", "feed-title");
    const heading = el("h2", "visually-hidden", "記事");
    heading.id = "feed-title";
    feed.appendChild(heading);

    feed.appendChild(storyNode(items[0].section, items[0].index, "lead", 0));

    if (items.length > 1) {
      const rest = el("div", "stories");
      items.slice(1).forEach(function (item, i) {
        rest.appendChild(storyNode(item.section, item.index, "story", i + 1));
      });
      feed.appendChild(rest);
    }
    return feed;
  }

  /* ===== ワードクラウド =====
     語の大きさを記事の本数に比例させ、中心から渦巻きに詰めて置く。
     置き場所は总当たりの衝突判定で決める（外部ライブラリは使わない）。 */

  /* 語の強弱は大きさで示し、色は面の色を順に回して雲を賑やかにする。
     下位の語は控えめな色にして、上位の語が先に目に入るようにする */
  function cloudTierClass(rank, total) {
    if (rank < Math.ceil(total / 2)) return "cloud--c" + (rank % 5);
    return "cloud--quiet";
  }

  function cloudCollides(x, y, w, h, placed) {
    for (var i = 0; i < placed.length; i++) {
      var p = placed[i];
      if (x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y) return true;
    }
    return false;
  }

  function layoutCloud(box, list) {
    var W = box.clientWidth;
    var H = box.clientHeight;   // 枠はCSSで固定。中身をこの高さに収める
    if (W < 80) {   // まだレイアウトされていない。次の描画で再挑戦
      requestAnimationFrame(function () { layoutCloud(box, list); });
      return;
    }
    box.replaceChildren();

    var counts = list.map(function (t) { return t.article_count; });
    var maxC = Math.max.apply(null, counts);
    var minC = Math.min.apply(null, counts);
    var denom = (Math.sqrt(maxC) - Math.sqrt(minC)) || 1;
    var sMin = 13;
    var sMax = Math.min(40, W / 8.5);

    var measure = document.createElement("canvas").getContext("2d");
    var placed = [];
    var minY = Infinity, maxY = -Infinity;

    // 大きい語から置く。後から来る小さい語が隙間に入る
    var sorted = list.slice().sort(function (a, b) {
      return b.article_count - a.article_count;
    });

    sorted.forEach(function (t, idx) {
      var size = Math.round(
        sMin + ((Math.sqrt(t.article_count) - Math.sqrt(minC)) / denom) * (sMax - sMin)
      );
      measure.font = "600 " + size + "px -apple-system, 'Hiragino Sans', sans-serif";
      var w = measure.measureText(t.term).width + size * 0.4;
      var h = size * 1.25;

      // アルキメデスの渦巻き。縦を0.6倍につぶして横長の雲にする
      var angle = idx * 2.4;
      var r = 0, x, y, ok = false, tries = 0;
      while (tries < 2600) {
        x = W / 2 + r * Math.cos(angle) - w / 2;
        y = r * Math.sin(angle) * 0.6 - h / 2;
        if (x >= 0 && x + w <= W &&
            y >= -H / 2 && y + h <= H / 2 &&
            !cloudCollides(x, y, w, h, placed)) { ok = true; break; }
        angle += 0.4;
        r += 1.0;
        tries++;
      }
      if (!ok) return;   // 固定枠に入り切らない語は省く（小さい語から諦める）

      placed.push({ x: x, y: y, w: w, h: h });
      if (y < minY) minY = y;
      if (y + h > maxY) maxY = y + h;

      var node = el("span", "cloud__word " + cloudTierClass(idx, sorted.length), t.term);
      node.style.fontSize = size + "px";
      node.style.left = x.toFixed(1) + "px";
      node.dataset.top = y.toFixed(1);
      node.title = t.article_count + "本の記事";
      box.appendChild(node);
    });

    // 置き終わってから、固定枠の縦中央に寄せる。枠の高さは変えない
    if (!placed.length) return;
    var shift = (H - (maxY - minY)) / 2 - minY;
    [].forEach.call(box.children, function (node) {
      node.style.top = (parseFloat(node.dataset.top) + shift).toFixed(1) + "px";
    });
  }

  var relayoutTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(relayoutTimer);
    relayoutTimer = setTimeout(function () {
      [].forEach.call(document.querySelectorAll(".cloud"), function (box) {
        if (box.__topics) layoutCloud(box, box.__topics);
      });
    }, 200);
  });

  function topicStrip(topicList) {
    const panel = el("section", "topics card");
    panel.setAttribute("aria-labelledby", "topics-title");
    const head = el("h2", "topics__title", "きょうの言葉");
    head.id = "topics-title";
    panel.appendChild(head);

    const cloud = el("div", "cloud");
    cloud.__topics = topicList;
    panel.appendChild(cloud);

    // 幅が決まってから置く
    requestAnimationFrame(function () { layoutCloud(cloud, topicList); });
    return panel;
  }

  function paper(data, handlers) {
    const root = document.createDocumentFragment();
    const issued = data.generated_at ? new Date(data.generated_at) : new Date();

    // 紙面の頭。題字・きょうの言葉・サマリーをひとまとめにする（広い画面で言葉とサマリーを並べる）
    const head = el("div", "paper-head");

    // --- 題字 ---
    // 上の行に印・題字と設定（歯車）、その下に日付を同じ大きさの灰色で、曜日と本数を小さく1行。
    // 歯車は app.js が持っている部品を借りてここへ移す（描き直しても同じ部品のまま）。
    // 英語の部分には lang="en" を付け、読み上げを英語の発音にする
    const masthead = el("header", "masthead");
    const bar = el("div", "masthead__bar");
    const brand = el("div", "masthead__brand");
    brand.appendChild(brandMark());
    const name = el("h1", "masthead__name", MASTHEAD_TITLE);
    name.lang = "en";
    brand.appendChild(name);
    bar.appendChild(brand);
    if (handlers && handlers.settingsControl) bar.appendChild(handlers.settingsControl);
    masthead.appendChild(bar);

    const dateLine = el("p", "masthead__date");
    dateLine.lang = "en";
    dateLine.appendChild(issueDateNode(issued));
    masthead.appendChild(dateLine);

    // 配信元は名前を並べると5行になったので数だけ（2026-09-20〜）
    const line = el("p", "masthead__line",
      issueLine(issued, data.total, data.sources ? data.sources.length : 0));
    line.lang = "en";
    masthead.appendChild(line);
    head.appendChild(masthead);
    root.appendChild(head);

    // 2026-10-14: きょうの言葉を一番上（題字のすぐ下）へ
    if (data.topics && data.topics.length) {
      head.appendChild(topicStrip(data.topics));
    }

    // --- きょうの要点。これが紙面の本体 ---
    if (!data.digest || !data.digest.length) {
      const empty = el("div", "empty");
      empty.appendChild(el("p", "empty__title", "まだ紙面がありません"));
      empty.appendChild(el("p", null, data.emptyHint ||
        "右上の歯車から「フィードを見る」を開いてニュースサイトのRSSを登録し、" +
        "「今日の紙面をつくる」を押してください。"));
      root.appendChild(empty);
      return root;
    }

    function goToStory(index) {
      const target = document.getElementById(storyId(index));
      if (target) arriveAt(target);
    }

    function briefingLabel(point) {
      const section = typeof point.story === "number" ? data.digest[point.story] : null;
      return (section && section.field) || point.genre || "";
    }

    // 2026-10-14: きょうの言葉の次に、きょうのサマリー
    const briefing = data.briefing && data.briefing.length
      ? briefingNode(data.briefing, briefingLabel, goToStory)
      : null;
    if (briefing) head.appendChild(briefing);
    // 広い画面では、きょうの言葉とサマリーを左右に並べる
    if (briefing && head.querySelector(".topics")) head.classList.add("paper-head--pair");

    // 2026-10-18: 面のタブとめくり（flip.js）を外し、全部の記事を1本のスクロールに並べる
    root.appendChild(feedNode(feedOrder(data.digest)));

    // --- 締め ---
    const colophon = el("div", "colophon");
    colophon.appendChild(el("p", null,
      "この紙面は、集めた記事すべてをAIが読んでまとめたものです。"));
    colophon.appendChild(el("p", null,
      "各項目の下のリンクが、そのもとになった記事です。正確さはそちらで確かめてください。"));
    root.appendChild(colophon);

    return root;
  }

  function feedList(feeds, handlers) {
    const root = document.createDocumentFragment();
    if (feeds.length === 0) {
      root.appendChild(el("p", "empty", "まだ何も登録されていません"));
      return root;
    }

    feeds.forEach(function (feed) {
      const row = el("div", "feed-row");
      const body = el("div", "feed-row__body");
      body.appendChild(el("p", "feed-row__title", feed.title));
      if (feed.url) body.appendChild(el("p", "feed-row__meta", feed.url));
      if (feed.last_error) {
        body.appendChild(el("p", "feed-row__error", feed.last_error));
      }
      row.appendChild(body);

      // どの面に載るか（名前とURLから自動で決まる）
      if (feed.genre) {
        row.appendChild(el("span",
          "feed-row__badge feed-row__badge--page genre--" + genreKey(feed.genre), feed.genre));
      }

      if (feed.readonly) {
        const label = ["", "重点", "通常", "軽め"][feed.priority] || "通常";
        row.appendChild(el("span", "feed-row__badge", label));

        const url = window.requestUrl && window.requestUrl("remove", feed.title);
        if (url) {
          const link = el("a", "btn btn--danger feed-row__act", "削除");
          link.href = url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          row.appendChild(link);
        }
        root.appendChild(row);
        return;
      }

      const select = el("select", "select");
      select.setAttribute("aria-label", feed.title + " の扱い");
      [[1, "重点"], [2, "通常"], [3, "軽め"]].forEach(function (pair) {
        const option = el("option", null, pair[1]);
        option.value = String(pair[0]);
        if (feed.priority === pair[0]) option.selected = true;
        select.appendChild(option);
      });
      select.addEventListener("change", function () {
        handlers.onPriority(feed.id, Number(select.value));
      });
      row.appendChild(select);

      const remove = el("button", "btn btn--danger", "削除");
      remove.type = "button";
      remove.addEventListener("click", function () {
        handlers.onDelete(feed.id, feed.title);
      });
      row.appendChild(remove);

      root.appendChild(row);
    });
    return root;
  }

  window.Render = {
    paper: paper, feedList: feedList, relativeTime: relativeTime,
  };
})();
