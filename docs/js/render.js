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

  /* 西暦から元号を出す。令和は1989年ではなく2019年5月1日から */
  function eraYear(date) {
    const reiwaStart = new Date(2019, 4, 1);
    if (date < reiwaStart) return "";
    const year = date.getFullYear() - 2018;
    return "令和" + (year === 1 ? "元" : year) + "年";
  }

  /* 朝刊・夕刊。新聞の刊種の目安に合わせて15時で切り替える */
  function editionName(date) {
    return date.getHours() < 15 ? "朝刊" : "夕刊";
  }

  function formatIssueDate(date) {
    const days = ["日", "月", "火", "水", "木", "金", "土"];
    const era = eraYear(date);
    return date.getFullYear() + "年" + (era ? "（" + era + "）" : "") +
      (date.getMonth() + 1) + "月" + date.getDate() + "日　" +
      days[date.getDay()] + "曜日";
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

  /* 総括の1段落 = 紙面の1記事。下に根拠の元記事をぶら下げる。
     分野名は項目ごとには出さない。同じ分野が並ぶと重複して見えるため、
     paper() が面名（section-head）としてグループの先頭に1回だけ置く。
     項目の表札は、段落ごとに付けた短い見出し（subtitle）。 */
  function digestSection(section, index, handlers) {
    const block = el("section", "brief");

    const head = el("div", "brief__head");
    head.appendChild(el("span", "brief__num", ("0" + (index + 1)).slice(-2)));
    if (section.subtitle) {
      head.appendChild(el("h2", "brief__title", section.subtitle));
    }
    block.appendChild(head);

    block.appendChild(el("p", "brief__text", section.text));

    if (section.sources && section.sources.length) {
      const wrap = el("div", "sources");
      wrap.appendChild(el("p", "sources__label", "出典"));
      const list = el("ul", "brief__sources");
      section.sources.forEach(function (s) {
        const item = el("li");
        const link = el("a", "brief__source");
        link.href = s.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.appendChild(el("span", "brief__outlet", s.feed_title));
        link.appendChild(document.createTextNode(s.title));
        item.appendChild(link);
        list.appendChild(item);
      });
      wrap.appendChild(list);
      block.appendChild(wrap);
    }
    return block;
  }

  /* ===== ワードクラウド =====
     語の大きさを記事の本数に比例させ、中心から渦巻きに詰めて置く。
     置き場所は总当たりの衝突判定で決める（外部ライブラリは使わない）。 */

  /* 語の強弱は大きさに加えて色でも示す。上位3語は青、次の半分は本文の色、
     残りは控えめな色。色相を増やさず、家の3色で段を作る */
  function cloudTierClass(rank, total) {
    if (rank < 3) return "cloud--key";
    if (rank < Math.ceil(total / 2)) return "cloud--main";
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
    // 見出しも説明も置かない。雲は見れば分かる
    const panel = el("section", "topics");

    const cloud = el("div", "cloud");
    cloud.__topics = topicList;
    panel.appendChild(cloud);

    // 幅が決まってから置く
    requestAnimationFrame(function () { layoutCloud(cloud, topicList); });
    return panel;
  }

  function sectionHead(mark, label) {
    const head = el("div", "section-head");
    head.appendChild(el("span", "section-head__mark", mark));
    if (label) head.appendChild(el("span", null, label));
    return head;
  }

  /* 面の見出し（総合・エンタメ・話題）。新聞の面替わりの双罫。
     面が1つしかない紙面（2026-09-17までの総合だけの紙面）には出さない */
  function pageHead(name, index) {
    const head = el("div", "page-head");
    head.id = "page-" + index;
    head.appendChild(el("span", "page-head__name", name));
    head.appendChild(el("span", "page-head__suffix", "面"));
    return head;
  }

  /* 面のタブ。題字の下に固定され、押すとその面の頭へ飛ぶ */
  function pageNav(pageOrder, counts) {
    const nav = el("nav", "pagenav");
    nav.setAttribute("aria-label", "面");
    pageOrder.forEach(function (name, i) {
      const link = el("a", "pagenav__link");
      link.href = "#page-" + i;
      link.appendChild(document.createTextNode(name));
      if (counts && counts[name]) {
        link.appendChild(el("span", "pagenav__count", String(counts[name])));
      }
      link.addEventListener("click", function (event) {
        const target = document.getElementById("page-" + i);
        if (!target) return;   // 無ければ通常のリンクとして飛ぶ
        event.preventDefault();
        const reduce = window.matchMedia &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
      });
      nav.appendChild(link);
    });
    return nav;
  }

  /* 固定タブの現在地と「固定中」の見た目。スクロールのたびに、
     タブの下端を越えた最後の面を現在地にする */
  var navTicking = false;

  function syncPageNav() {
    navTicking = false;
    var nav = document.querySelector(".pagenav");
    if (!nav) return;
    var rect = nav.getBoundingClientRect();
    var stickTop = parseFloat(getComputedStyle(nav).top) || 0;
    nav.classList.toggle("pagenav--stuck", window.scrollY > 0 && rect.top <= stickTop + 0.5);

    // タブで飛んだ見出しは scroll-margin のぶん（12px）タブの下に着地するので、
    // その余裕を含めて「タブの下端を越えた」とみなす
    var heads = document.querySelectorAll(".page-head");
    var current = heads.length ? heads[0].id : null;
    for (var i = 0; i < heads.length; i++) {
      if (heads[i].getBoundingClientRect().top <= rect.bottom + 24) current = heads[i].id;
    }
    var links = nav.querySelectorAll(".pagenav__link");
    for (var j = 0; j < links.length; j++) {
      if (links[j].getAttribute("href") === "#" + current) {
        links[j].setAttribute("aria-current", "true");
      } else {
        links[j].removeAttribute("aria-current");
      }
    }
  }

  function requestNavSync() {
    if (navTicking) return;
    navTicking = true;
    requestAnimationFrame(syncPageNav);
  }

  window.addEventListener("scroll", requestNavSync, { passive: true });
  window.addEventListener("resize", requestNavSync);

  function paper(data, handlers) {
    const root = document.createDocumentFragment();
    const issued = data.generated_at ? new Date(data.generated_at) : new Date();

    // 面（総合・エンタメ・話題）の並びは、紙面データに出てくる順。
    // 面が1つしかない紙面（2026-09-17までの総合だけの紙面）にはタブも面の見出しも出さない
    const pageOrder = [];
    (data.digest || []).forEach(function (s) {
      if (s.genre && pageOrder.indexOf(s.genre) < 0) pageOrder.push(s.genre);
    });
    const showPages = pageOrder.length >= 2;

    // --- 題字 ---
    const masthead = el("header", "masthead");

    // 題字を左、発行日と刊種を右に。題字まわりを低く保って、本文を早く見せる
    const row = el("div", "masthead__row");
    row.appendChild(el("h1", "masthead__name", "紙面"));
    const strip = el("div", "masthead__strip");
    strip.appendChild(el("span", "masthead__edition", editionName(issued)));
    strip.appendChild(el("span", "masthead__date", formatIssueDate(issued)));
    row.appendChild(strip);
    masthead.appendChild(row);

    // 本数と配信元の数を一行で。面ごとの本数はタブに出す（タブが無い紙面ではここに出す）。
    // 配信元の名前を全部並べるとフィードが10本を超えたあたりで5行になり、
    // 題字まわりが読めなくなった。面の本数が無い古い紙面データでは、従来どおり名前を並べる
    const pageNames = Object.keys(data.pages || {});
    let meta = "全" + data.total + "本";
    if (pageNames.length) {
      if (!showPages) {
        meta += "　" + pageNames.map(function (name) {
          return name + data.pages[name];
        }).join("・");
      }
      const sourceCount = data.sources ? data.sources.length : 0;
      if (sourceCount) meta += "　配信元" + sourceCount;
    } else if (data.sources && data.sources.length) {
      meta += "　" + data.sources.join("・");
    }
    masthead.appendChild(el("p", "masthead__meta", meta));
    root.appendChild(masthead);

    if (showPages && data.digest && data.digest.length) {
      root.appendChild(pageNav(pageOrder, data.pages || {}));
    }

    // --- きょうの要点。これが紙面の本体 ---
    if (!data.digest || !data.digest.length) {
      const empty = el("div", "empty");
      empty.appendChild(el("p", "empty__title", "まだ紙面がありません"));
      empty.appendChild(el("p", null, data.emptyHint ||
        "右上の「フィード」からニュースサイトのRSSを登録して、" +
        "「今日の紙面をつくる」を押してください。"));
      root.appendChild(empty);
      return root;
    }

    if (data.topics && data.topics.length) {
      root.appendChild(topicStrip(data.topics));
    }

    // 同じ面・同じ分野はサーバー側でまとまって並んでくる。面が変わる位置に
    // 面の見出し、分野が変わる位置にだけ分野名を置く（項目ごとに繰り返さない）
    const body = el("section", "briefs");
    let currentPage = null;
    let currentField = null;
    data.digest.forEach(function (section, index) {
      if (showPages && section.genre && section.genre !== currentPage) {
        body.appendChild(pageHead(section.genre, pageOrder.indexOf(section.genre)));
        currentPage = section.genre;
        currentField = null;
      }
      if (section.field && section.field !== currentField) {
        body.appendChild(sectionHead(section.field, ""));
      }
      currentField = section.field;
      body.appendChild(digestSection(section, index, handlers));
    });
    root.appendChild(body);

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
        row.appendChild(el("span", "feed-row__badge feed-row__badge--page", feed.genre));
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
    paper: paper, feedList: feedList, relativeTime: relativeTime, syncPageNav: syncPageNav,
  };
})();
