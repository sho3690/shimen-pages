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

  /* 総括の1段落 = 紙面の1記事。kind は "lead"（面のトップ）か "story" */
  function storyNode(section, index, kind) {
    const block = el("article", kind);
    block.id = storyId(index);

    const kicker = el("p", kind + "__kicker");
    kicker.appendChild(el("span", kind + "__num", storyNum(index)));
    if (section.field) kicker.appendChild(el("span", kind + "__field", section.field));
    block.appendChild(kicker);

    if (section.subtitle) {
      block.appendChild(el(kind === "lead" ? "h2" : "h3", kind + "__title", section.subtitle));
    }
    block.appendChild(el("p", kind + "__text", section.text));

    if (section.sources && section.sources.length) {
      block.appendChild(sourceList(section.sources));
    }
    return block;
  }

  function scrollToNode(node) {
    const reduce = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }

  /* 面のトップの右に置く「この面の記事」。押すとその記事へ飛ぶ */
  function railNode(items) {
    const rail = el("nav", "rail");
    rail.setAttribute("aria-label", "この面の記事");
    rail.appendChild(el("p", "rail__label", "この面の記事"));
    const list = el("ol", "rail__list");
    items.forEach(function (item) {
      const li = el("li");
      const link = el("a", "rail__link");
      link.href = "#" + storyId(item.index);
      link.appendChild(el("span", "rail__num", storyNum(item.index)));
      link.appendChild(el("span", "rail__title", item.section.subtitle || item.section.field || "記事"));
      link.addEventListener("click", function (event) {
        const target = document.getElementById(storyId(item.index));
        if (!target) return;
        event.preventDefault();
        scrollToNode(target);
      });
      li.appendChild(link);
      list.appendChild(li);
    });
    rail.appendChild(list);
    return rail;
  }

  /* 1面ぶん。1本目をトップに大きく、残りを段組みで並べる */
  function pagePanel(items) {
    const panel = el("div", "panel");

    const front = el("div", "front");
    front.appendChild(storyNode(items[0].section, items[0].index, "lead"));
    if (items.length > 1) front.appendChild(railNode(items.slice(1)));
    panel.appendChild(front);

    if (items.length > 1) {
      const rest = el("div", "stories");
      items.slice(1).forEach(function (item) {
        rest.appendChild(storyNode(item.section, item.index, "story"));
      });
      panel.appendChild(rest);
    }
    return panel;
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
    const panel = el("section", "topics");
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

  /* 面のタブ（総合・エンタメ・話題）。押した面だけを見せる。
     題字の下に置くだけで固定はしない（スクロール中に本文とぶつからない） */
  var currentPage = 0;

  function pageFromHash(count) {
    var m = /^#(?:p|page-)(\d)$/.exec(location.hash || "");
    var n = m ? Number(m[1]) : NaN;
    return n >= 0 && n < count ? n : 0;
  }

  function pageTabs(pageOrder, counts, panels) {
    const nav = el("div", "tabs");
    nav.setAttribute("role", "tablist");
    nav.setAttribute("aria-label", "面");
    const tabs = [];

    function select(i, focus) {
      currentPage = i;
      tabs.forEach(function (tab, j) {
        const on = i === j;
        tab.setAttribute("aria-selected", on ? "true" : "false");
        tab.tabIndex = on ? 0 : -1;
        panels[j].hidden = !on;
      });
      if (focus) tabs[i].focus();
      try { history.replaceState(null, "", "#p" + i); } catch (e) {}
    }

    pageOrder.forEach(function (name, i) {
      const tab = el("button", "tab");
      tab.type = "button";
      tab.id = "tab-" + i;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", "panel-" + i);
      tab.appendChild(el("span", "tab__name", name));
      if (counts && counts[name]) {
        tab.appendChild(el("span", "tab__count", counts[name] + "本"));
      }
      tab.addEventListener("click", function () { select(i, false); });
      tab.addEventListener("keydown", function (event) {
        var next = null;
        if (event.key === "ArrowRight") next = (i + 1) % pageOrder.length;
        if (event.key === "ArrowLeft") next = (i + pageOrder.length - 1) % pageOrder.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = pageOrder.length - 1;
        if (next === null) return;
        event.preventDefault();
        select(next, true);
      });
      tabs.push(tab);
      nav.appendChild(tab);
    });

    nav.select = select;
    return nav;
  }

  /* 面の最後に置く「次の面へ」。最後の面では最初の面へ戻す */
  function nextPageLink(pageOrder, counts, i, tabsNode) {
    const next = (i + 1) % pageOrder.length;
    const name = pageOrder[next];
    const wrap = el("div", "turn");
    const btn = el("button", "btn btn--secondary turn__btn");
    btn.type = "button";
    btn.textContent = next === 0
      ? name + "面へ戻る"
      : "次の面　" + name + (counts && counts[name] ? "（" + counts[name] + "本）" : "") + "　→";
    btn.addEventListener("click", function () {
      tabsNode.select(next, false);
      scrollToNode(tabsNode);
      document.getElementById("tab-" + next).focus({ preventScroll: true });
    });
    wrap.appendChild(btn);
    return wrap;
  }

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

    // 題字を左、発行日・刊種・本数を右に。題字まわりを低く保って、本文を早く見せる
    const row = el("div", "masthead__row");
    row.appendChild(el("h1", "masthead__name", "紙面"));
    const strip = el("div", "masthead__strip");
    strip.appendChild(el("p", "masthead__date", formatIssueDate(issued)));
    const line = el("p", "masthead__line");
    line.appendChild(el("span", "masthead__edition", editionName(issued)));
    strip.appendChild(line);
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
    line.appendChild(el("span", "masthead__meta", meta));
    root.appendChild(masthead);

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

    // 面ごとに項目を分ける。番号は紙面全体の通し番号のまま
    const groups = showPages ? pageOrder.map(function () { return []; }) : [[]];
    data.digest.forEach(function (section, index) {
      const g = showPages ? pageOrder.indexOf(section.genre) : 0;
      groups[g < 0 ? 0 : g].push({ section: section, index: index });
    });

    const panels = groups.map(function (items, i) {
      const panel = pagePanel(items);
      if (showPages) {
        panel.id = "panel-" + i;
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", "tab-" + i);
      }
      return panel;
    });

    if (showPages) {
      const tabsNode = pageTabs(pageOrder, data.pages || {}, panels);
      root.appendChild(tabsNode);
      panels.forEach(function (panel, i) {
        panel.appendChild(nextPageLink(pageOrder, data.pages || {}, i, tabsNode));
        root.appendChild(panel);
      });
      tabsNode.select(pageFromHash(pageOrder.length), false);
    } else {
      root.appendChild(panels[0]);
    }

    if (data.topics && data.topics.length) {
      root.appendChild(topicStrip(data.topics));
    }

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
    paper: paper, feedList: feedList, relativeTime: relativeTime,
  };
})();
