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

  /* 総括の1段落 = 紙面の1記事。下に根拠の元記事をぶら下げる。 */
  function digestSection(section, index, handlers) {
    const block = el("section", "brief");

    const head = el("div", "brief__head");
    head.appendChild(el("span", "brief__num", ("0" + (index + 1)).slice(-2)));
    if (section.field) head.appendChild(el("h2", "brief__field", section.field));
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

  /* その日、複数の記事に繰り返し出てきた語。
     語の大きさを本数に比例させて、その日の重心が一目で分かるようにする。 */
  function topicStrip(topicList) {
    const panel = el("section", "topics");

    const head = el("div", "topics__head");
    head.appendChild(el("h2", "topics__title", "ワードクラウド"));
    head.appendChild(el("p", "topics__note", "数字は取り上げた記事の本数"));
    panel.appendChild(head);

    const counts = topicList.map(function (t) { return t.article_count; });
    const max = Math.max.apply(null, counts);
    const min = Math.min.apply(null, counts);
    const span = Math.max(1, max - min);

    // 大きい語を中央寄りに置くと雲らしく見える。
    // 1,3,5… 番目を前へ、2,4,6… 番目を後ろへ回して山型に並べ替える
    const front = [];
    const back = [];
    topicList.forEach(function (t, i) {
      (i % 2 === 0 ? front : back).push(t);
    });
    const arranged = back.reverse().concat(front);

    const cloud = el("div", "cloud");
    arranged.forEach(function (t) {
      const step = Math.round(((t.article_count - min) / span) * 4);   // 0〜4
      const item = el("span", "cloud__word cloud--" + step);
      item.appendChild(el("span", "cloud__term", t.term));
      item.appendChild(el("span", "cloud__count", t.article_count));
      cloud.appendChild(item);
    });
    panel.appendChild(cloud);
    return panel;
  }

  function sectionHead(mark, label) {
    const head = el("div", "section-head");
    head.appendChild(el("span", "section-head__mark", mark));
    head.appendChild(el("span", null, label));
    return head;
  }

  function paper(data, handlers) {
    const root = document.createDocumentFragment();
    const issued = data.generated_at ? new Date(data.generated_at) : new Date();

    // --- 題字 ---
    const masthead = el("header", "masthead");

    const strip = el("div", "masthead__strip");
    strip.appendChild(el("span", null, formatIssueDate(issued)));
    strip.appendChild(el("span", "masthead__edition", editionName(issued)));
    masthead.appendChild(strip);

    masthead.appendChild(el("h1", "masthead__name", "紙面"));
    masthead.appendChild(el("hr", "masthead__rule"));

    const sources = data.sources && data.sources.length
      ? data.sources.join("・")
      : "";
    masthead.appendChild(el(
      "p", "masthead__meta",
      "全" + data.total + "本" + (sources ? "　" + sources : "")
    ));
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

    if (data.topics && data.topics.length) {
      root.appendChild(topicStrip(data.topics));
    }

    const body = el("section", "briefs");
    data.digest.forEach(function (section, index) {
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

      if (feed.readonly) {
        const label = ["", "重点", "通常", "軽め"][feed.priority] || "通常";
        row.appendChild(el("span", "feed-row__badge", label));
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

  window.Render = { paper: paper, feedList: feedList, relativeTime: relativeTime };
})();
