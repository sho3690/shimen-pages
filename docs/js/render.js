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

    // --- 今日の要点（紙面全体を読んだ総括）。これだけ読めば済むように上に置く ---
    if (data.digest && data.digest.length) {
      const digest = el("section", "digest");
      digest.appendChild(el("p", "digest__label", "きょうの要点"));
      data.digest.forEach(function (paragraph) {
        const match = /^【([^】]{1,8})】\s*(.*)$/.exec(paragraph);
        const line = el("p", "digest__para");
        if (match) {
          line.appendChild(el("span", "digest__field", match[1]));
          line.appendChild(document.createTextNode(match[2]));
        } else {
          line.textContent = paragraph;
        }
        digest.appendChild(line);
      });
      digest.appendChild(el("p", "digest__note",
        "この要点は紙面全体をAIが読んでまとめたものです。詳しくは各記事へ。"));
      root.appendChild(digest);
    }

    if (!data.lead) {
      const empty = el("div", "empty");
      empty.appendChild(el("p", "empty__title", "まだ記事がありません"));
      empty.appendChild(el("p", null, data.emptyHint ||
        "右上の「フィード」からニュースサイトのRSSを登録して、" +
        "「今日の紙面をつくる」を押してください。"));
      root.appendChild(empty);
      return root;
    }

    // --- 一面 ---
    const lead = el("section", "lead");
    lead.appendChild(articleNode(data.lead, handlers));
    root.appendChild(lead);

    // --- 二面（主要） ---
    if (data.seconds.length > 0) {
      root.appendChild(sectionHead("二面", "主要"));
      const seconds = el("section", "seconds");
      if (data.seconds.length === 1) seconds.classList.add("seconds--single");
      data.seconds.forEach(function (a) {
        seconds.appendChild(articleNode(a, handlers));
      });
      root.appendChild(seconds);
    }

    // --- 総合面 ---
    if (data.items.length > 0) {
      root.appendChild(sectionHead("総合", "その他の記事"));
      const items = el("section", "items");
      data.items.forEach(function (a) {
        items.appendChild(articleNode(a, handlers));
      });
      root.appendChild(items);
    }

    // --- 締め ---
    const colophon = el("div", "colophon");
    colophon.appendChild(el("p", null,
      "見出しをタップすると配信元の記事が開きます。"));
    colophon.appendChild(el("p", null,
      "要約はこのMacの中のAIが作成したものです。正確さは元記事で確かめてください。"));
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
      body.appendChild(el("p", "feed-row__meta", feed.url));
      if (feed.last_error) {
        body.appendChild(el("p", "feed-row__error", feed.last_error));
      }
      row.appendChild(body);

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
