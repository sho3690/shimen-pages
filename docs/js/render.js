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
     2026-10-18: ニュースアプリ（Apple News）の組み方にそろえ、名前を「Gist」に。
     同じ日に「簡素すぎる。タイトルと分かるように、ちょうどよく目立たせて」との依頼で、
     名前を「HIBI」（日々）にした。題字は4案を見比べてもらい、太い文字の「HIBI」の下に
     面の色（総合・エンタメ・話題）の短い線を3本並べる形に決まった。
     その下に日付（太字）と、朝・夕と本数の1行 */
  const MASTHEAD_TITLE = "HIBI";
  const MASTHEAD_JA = "日々";
  const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];

  /* 「Sunday, October 18」。short なら「October 18」 */
  function issueDateNode(date, short) {
    const day = MONTHS_EN[date.getMonth()] + " " + date.getDate();
    const time = el("time", null, short ? day : DAYS_EN[date.getDay()] + ", " + day);
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

  /* 「Morning · 20 stories from 11 sources」。朝・夕は15時で切り替える。
     本数は記事のページの数（めくって読む本数）にそろえる */
  function issueLine(date, storyCount, sourceCount) {
    let text = date.getHours() < 15 ? "Morning" : "Evening";
    if (storyCount) {
      text += " · " + countText(storyCount, "story", "stories");
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

  /* 題字の下の三色の線（総合・エンタメ・話題の色）。飾りなので読み上げない */
  function stripeNode(className) {
    const stripe = el("span", className);
    stripe.setAttribute("aria-hidden", "true");
    ["general", "ent", "buzz"].forEach(function (g) {
      stripe.appendChild(el("i", "stripe__bar genre--" + g));
    });
    return stripe;
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

  function storyNum(index) { return ("0" + (index + 1)).slice(-2); }

  function seedOf(section) { return section.subtitle || section.text || ""; }

  /* 本文の中の「ことば」に下線を引く。同じ言葉は最初の1回だけ。
     長い言葉から先に場所を決め、重なる短い言葉は引かない */
  function markedText(className, text, terms) {
    const node = el("p", className);
    const ranges = [];
    (terms || []).slice().sort(function (a, b) {
      return b.term.length - a.term.length;
    }).forEach(function (t) {
      const at = text.indexOf(t.term);
      if (at < 0) return;
      const end = at + t.term.length;
      if (ranges.some(function (r) { return at < r[1] && end > r[0]; })) return;
      ranges.push([at, end]);
    });
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    let pos = 0;
    ranges.forEach(function (r) {
      if (r[0] > pos) node.appendChild(document.createTextNode(text.slice(pos, r[0])));
      node.appendChild(el("span", "term-mark", text.slice(r[0], r[1])));
      pos = r[1];
    });
    if (pos < text.length) node.appendChild(document.createTextNode(text.slice(pos)));
    return node;
  }

  /* 「ことば」。本文に出てくる言葉の意味（AIが書いた一般的な意味） */
  function termsNode(terms, id) {
    const box = el("section", "terms");
    box.setAttribute("aria-labelledby", id);
    const title = el("h3", "terms__title", "ことば");
    title.id = id;
    box.appendChild(title);
    const list = el("dl", "terms__list");
    terms.forEach(function (t) {
      const row = el("div", "terms__item");
      row.appendChild(el("dt", "terms__term", t.term));
      row.appendChild(el("dd", "terms__meaning", t.meaning));
      list.appendChild(row);
    });
    box.appendChild(list);
    return box;
  }

  /* 記事1本ぶんのページ（2026-10-18〜。1本ずつめくって読む）。
     上に小さな題字（押すと表紙へ）と日付、その下に記事のカード:
     模様 → 分野と番号 → 見出し → かんたんに言うと → くわしく → ことば → 出典。
     「かんたんに言うと」と「ことば」は、その分野に詳しくない人のためにAIが書いたもの
     （無い日・無い記事もある。そのときは本文だけ） */
  function storyPage(section, position, total, issued, goHome) {
    const genre = genreKey(section.genre);
    const page = el("article", "page page--story genre--" + genre);
    const titleId = "story-title-" + (position + 1);
    page.setAttribute("aria-labelledby", titleId);

    const head = el("div", "page__head");
    const home = el("a", "page__home");
    home.href = location.pathname + location.search;
    const brand = el("span", "page__brand");
    brand.setAttribute("aria-hidden", "true");
    brand.appendChild(el("span", "page__brand-name", MASTHEAD_TITLE));
    brand.appendChild(stripeNode("stripe stripe--small"));
    home.appendChild(brand);
    home.appendChild(el("span", "visually-hidden", "表紙に戻る"));
    home.addEventListener("click", function (event) {
      event.preventDefault();
      goHome();
    });
    head.appendChild(home);
    const when = el("p", "page__date");
    when.lang = "en";
    when.appendChild(issueDateNode(issued, true));
    head.appendChild(when);
    page.appendChild(head);

    const card = el("div", "story card");
    const art = el("div", "story__art");
    art.appendChild(artNode(seedOf(section), genre, 6, 2));
    card.appendChild(art);

    const body = el("div", "story__body");
    const kicker = el("p", "story__kicker");
    if (section.field) kicker.appendChild(el("span", "story__field", section.field));
    kicker.appendChild(el("span", "story__num", storyNum(position) + " / " + total));
    body.appendChild(kicker);

    const title = el("h2", "story__title", section.subtitle || section.field || "記事");
    title.id = titleId;
    body.appendChild(title);

    const terms = section.terms || [];
    if (section.easy) {
      const easy = el("section", "easy");
      easy.setAttribute("aria-label", "かんたんに言うと");
      easy.appendChild(el("p", "easy__label", "かんたんに言うと"));
      easy.appendChild(el("p", "easy__text", section.easy));
      body.appendChild(easy);
      body.appendChild(el("p", "story__label", "くわしく"));
    }
    body.appendChild(markedText("story__text", section.text, terms));

    if (terms.length) body.appendChild(termsNode(terms, "terms-" + (position + 1)));
    if (section.sources && section.sources.length) {
      body.appendChild(sourceList(section.sources));
    }
    card.appendChild(body);
    page.appendChild(card);
    return page;
  }

  /* きょうのサマリー（2026-10-14〜）。紙面全体から数行の要点。
     記事が分かる行は押せて、その記事のページへめくる。行の頭の小見出しは、
     記事と同じ分野名（国際・音楽など）。分からない行は面の名前 */
  function briefingNode(points, labelOf, hrefOf, goToStory) {
    const card = el("section", "briefing card");
    card.setAttribute("aria-labelledby", "briefing-title");
    const title = el("h2", "briefing__title", "きょうのサマリー");
    title.id = "briefing-title";
    card.appendChild(title);

    const list = el("ol", "briefing__list");
    points.forEach(function (point) {
      const href = typeof point.story === "number" ? hrefOf(point.story) : null;
      const row = el(href ? "a" : "div", "briefing__row");
      if (point.genre) row.classList.add("genre--" + genreKey(point.genre));
      const words = el("span", "briefing__words");
      const label = labelOf(point);
      if (label) words.appendChild(el("span", "briefing__genre", label));
      words.appendChild(el("span", "briefing__text", point.text));
      row.appendChild(words);
      if (href) {
        row.href = href;
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

  /* 2026-10-18: 面（総合・エンタメ・話題）に分けず、記事を1本ずつ並べる。
     面の中の並び（大事な順）は崩さず、面ごとの本数の割合で混ぜる。
     例: 総合8・エンタメ6・話題6 なら 総合・エンタメ・話題・総合・… の順になり、
     1本目は総合の1本目 */
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

  function chevronNode(dir) {
    const svg = svgNode("svg", {
      class: "icon", viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false",
    });
    svg.appendChild(svgNode("path", { d: dir < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7" }));
    return svg;
  }

  /* 下に浮かぶ、めくりのボタン。いまのページと、全体のどこまで来たかの線 */
  function pagerNode() {
    const nav = el("nav", "pager");
    nav.setAttribute("aria-label", "ページをめくる");
    function button(dir, label) {
      const b = el("button", "pager__btn");
      b.type = "button";
      b.setAttribute("aria-label", label);
      b.appendChild(chevronNode(dir));
      return b;
    }
    const prev = button(-1, "前のページ");
    const next = button(1, "次のページ");
    const mid = el("div", "pager__mid");
    const count = el("p", "pager__count");
    count.setAttribute("aria-live", "polite");
    const track = el("div", "pager__track");
    const fill = el("div", "pager__fill");
    track.appendChild(fill);
    mid.appendChild(count);
    mid.appendChild(track);
    nav.appendChild(prev);
    nav.appendChild(mid);
    nav.appendChild(next);
    return { node: nav, prev: prev, next: next, count: count, fill: fill };
  }

  /* 開いたときのページ。「#p3」なら3本目の記事（読み直しても同じページに戻る） */
  function pageFromHash(count) {
    const m = /^#p(\d{1,3})$/.exec(location.hash || "");
    const i = m ? Number(m[1]) : 0;
    return i >= 0 && i < count ? i : 0;
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
    if (W < 80 || W === box.__laidWidth) return;   // まだ見えていない・幅が変わっていない
    box.__laidWidth = W;
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

  /* 幅が決まったとき・変わったときに置き直す。表紙が隠れている間（記事のページを
     開いている間）は幅が0なので、表紙に戻って見えたときに置く */
  function watchCloud(box, list) {
    if (window.ResizeObserver) {
      var timer = null;
      new ResizeObserver(function () {
        clearTimeout(timer);
        timer = setTimeout(function () { layoutCloud(box, list); }, box.__laidWidth ? 150 : 0);
      }).observe(box);
    } else {
      requestAnimationFrame(function () { layoutCloud(box, list); });
      window.addEventListener("resize", function () { layoutCloud(box, list); });
    }
  }

  function topicStrip(topicList) {
    const panel = el("section", "topics card");
    panel.setAttribute("aria-labelledby", "topics-title");
    const head = el("h2", "topics__title", "きょうの言葉");
    head.id = "topics-title";
    panel.appendChild(head);

    const cloud = el("div", "cloud");
    panel.appendChild(cloud);
    watchCloud(cloud, topicList);   // 幅が決まってから置く
    return panel;
  }

  function paper(data, handlers) {
    const root = document.createDocumentFragment();
    const issued = data.generated_at ? new Date(data.generated_at) : new Date();
    const items = data.digest && data.digest.length ? feedOrder(data.digest) : [];

    // --- 表紙: 題字・きょうの言葉・きょうのサマリー ---
    const cover = el("section", "page page--cover");
    cover.setAttribute("aria-label", "表紙");
    const head = el("div", "paper-head");

    // 上の行に題字と設定（歯車）、その下に日付と本数。
    // 歯車は app.js が持っている部品を借りてここへ移す（描き直しても同じ部品のまま）。
    // 英語の部分には lang="en" を付け、読み上げを英語の発音にする
    const masthead = el("header", "masthead");
    const bar = el("div", "masthead__bar");
    const name = el("h1", "masthead__name");
    const latin = el("span", "masthead__en", MASTHEAD_TITLE);
    latin.lang = "en";
    name.appendChild(latin);
    name.appendChild(el("span", "masthead__ja", MASTHEAD_JA));
    const brand = el("div", "masthead__brand");
    brand.appendChild(name);
    brand.appendChild(stripeNode("stripe"));
    bar.appendChild(brand);
    if (handlers && handlers.settingsControl) bar.appendChild(handlers.settingsControl);
    masthead.appendChild(bar);

    const dateLine = el("p", "masthead__date");
    dateLine.lang = "en";
    dateLine.appendChild(issueDateNode(issued));
    masthead.appendChild(dateLine);

    // 配信元は名前を並べると5行になったので数だけ（2026-09-20〜）
    const line = el("p", "masthead__line",
      issueLine(issued, items.length, data.sources ? data.sources.length : 0));
    line.lang = "en";
    masthead.appendChild(line);
    head.appendChild(masthead);
    cover.appendChild(head);

    // 2026-10-14: きょうの言葉を一番上（題字のすぐ下）へ
    if (data.topics && data.topics.length) {
      head.appendChild(topicStrip(data.topics));
    }

    if (!items.length) {
      const empty = el("div", "empty");
      empty.appendChild(el("p", "empty__title", "まだ紙面がありません"));
      empty.appendChild(el("p", null, data.emptyHint ||
        "右上の歯車から「フィードを見る」を開いてニュースサイトのRSSを登録し、" +
        "「今日の紙面をつくる」を押してください。"));
      cover.appendChild(empty);
      root.appendChild(cover);
      return root;
    }

    // --- 記事のページ（2026-10-18〜。1本ずつめくる。表紙が0ページ目） ---
    // サマリーの行は紙面データの番号で記事を指すので、何ページ目かに直して送る
    const pageOf = {};
    items.forEach(function (item, i) { pageOf[item.index] = i + 1; });

    const pager = pagerNode();
    const panels = [cover];
    let current = 0;
    const deck = {
      panels: panels,
      index: function () { return current; },
      select: function (i) {
        current = i;
        panels.forEach(function (p, k) { p.hidden = k !== i; });
        pager.prev.disabled = i === 0;
        pager.next.disabled = i === panels.length - 1;
        pager.count.textContent = i === 0
          ? "表紙 · " + items.length + "本"
          : i + " / " + items.length;
        pager.fill.style.transform = "scaleX(" + (i / items.length).toFixed(4) + ")";
        try {
          history.replaceState(null, "", i ? "#p" + i : location.pathname + location.search);
        } catch (e) { /* 履歴を書けない環境でも、ページは切り替える */ }
      },
    };

    // めくる（flip.js があればめくる動きで、無ければその場で切り替える）
    function go(i) {
      if (i < 0 || i >= panels.length || i === current) return;
      if (deck.turnTo) {
        deck.turnTo(i);
        return;
      }
      const top = panels[current].getBoundingClientRect().top;
      deck.select(i);
      if (top < 0) window.scrollTo(0, top + window.scrollY);
    }
    function step(dir) {
      if (deck.step) deck.step(dir);
      else go(current + dir);
    }

    items.forEach(function (item, i) {
      panels.push(storyPage(item.section, i, items.length, issued, function () { go(0); }));
    });

    function briefingLabel(point) {
      const section = typeof point.story === "number" ? data.digest[point.story] : null;
      return (section && section.field) || point.genre || "";
    }
    function briefingHref(story) {
      return pageOf[story] ? "#p" + pageOf[story] : null;
    }

    // 2026-10-14: きょうの言葉の次に、きょうのサマリー
    const briefing = data.briefing && data.briefing.length
      ? briefingNode(data.briefing, briefingLabel, briefingHref, function (story) {
        go(pageOf[story]);
      })
      : null;
    if (briefing) head.appendChild(briefing);
    // 広い画面では、きょうの言葉とサマリーを左右に並べる
    if (briefing && head.querySelector(".topics")) head.classList.add("paper-head--pair");

    // --- 締め（表紙の下） ---
    const colophon = el("div", "colophon");
    colophon.appendChild(el("p", null,
      "この紙面は、集めた記事すべてをAIが読んでまとめたものです。" +
      "「かんたんに言うと」と「ことば」の説明も、AIが書いています。"));
    colophon.appendChild(el("p", null,
      "各記事の下の出典が、そのもとになった記事です。正確さはそちらで確かめてください。"));
    cover.appendChild(colophon);

    const deckNode = el("div", "deck");
    panels.forEach(function (p) { deckNode.appendChild(p); });
    root.appendChild(deckNode);

    pager.prev.addEventListener("click", function () { step(-1); });
    pager.next.addEventListener("click", function () { step(1); });
    const fade = el("div", "pager-fade");
    fade.setAttribute("aria-hidden", "true");
    root.appendChild(fade);
    root.appendChild(pager.node);

    deck.select(pageFromHash(panels.length));
    if (window.Flip) window.Flip.attach(deck);
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
