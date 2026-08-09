/* 画面状態と操作。 */
(function () {
  "use strict";

  const paperEl = document.getElementById("paper");
  const noticesEl = document.getElementById("notices");
  const progressEl = document.getElementById("progress");
  const progressFill = document.getElementById("progress-fill");
  const progressText = document.getElementById("progress-text");
  const buildBtn = document.getElementById("build");
  const settingsEl = document.getElementById("settings");
  const feedListEl = document.getElementById("feed-list");
  const addFeedForm = document.getElementById("add-feed");
  const feedUrlInput = document.getElementById("feed-url");
  const addFeedError = document.getElementById("add-feed-error");
  const addFeedSubmit = document.getElementById("add-feed-submit");
  const wifiEl = document.getElementById("wifi");

  let stream = null;

  const STAGE_LABEL = {
    fetch: "記事を取得中",
    extract: "本文を読み込み中",
    summarize: "要約中",
  };

  const handlers = {
    onRead: function (id) { API.markRead(id).catch(function () {}); },
    onRetry: function (id) {
      API.resummarize(id)
        .then(startBuild)
        .catch(function (e) { notify("やり直せませんでした", e.message, "error"); });
    },
    onPriority: function (id, priority) {
      API.setPriority(id, priority).then(loadPaper).catch(function () {});
    },
    onDelete: function (id, title) {
      if (!window.confirm(title + " を削除しますか？")) return;
      API.deleteFeed(id).then(function () {
        loadFeeds();
        loadPaper();
      }).catch(function (e) { notify("削除できませんでした", e.message, "error"); });
    },
  };

  function notify(title, how, kind) {
    const box = document.createElement("div");
    box.className = "banner" + (kind === "error" ? " banner--error" : "");
    const t = document.createElement("p");
    t.className = "banner__title";
    t.textContent = title;
    box.appendChild(t);
    if (how) {
      const h = document.createElement("p");
      h.className = "banner__how";
      h.textContent = how;
      box.appendChild(h);
    }
    noticesEl.replaceChildren(box);
  }

  function clearNotices() { noticesEl.replaceChildren(); }

  function loadPaper() {
    return API.getPaper().then(function (data) {
      if (API.isStatic) {
        data.emptyHint = "Macで紙面を作ってから、もう一度開いてください。";
      }
      paperEl.replaceChildren(Render.paper(data, handlers));
      return data;
    }).catch(function (e) {
      notify("紙面を読み込めませんでした", e.message, "error");
      return null;
    });
  }

  function loadFeeds() {
    return API.listFeeds().then(function (data) {
      feedListEl.replaceChildren(Render.feedList(data.feeds, handlers));
      if (API.isStatic) {
        const box = document.createElement("div");
        box.className = "sheet__note";

        const url = window.requestUrl && window.requestUrl("add", "");
        if (url) {
          const add = document.createElement("a");
          add.className = "btn sheet__add";
          add.href = url;
          add.target = "_blank";
          add.rel = "noopener noreferrer";
          add.textContent = "フィードを追加する";
          box.appendChild(add);
        }

        const how = document.createElement("p");
        how.className = "sheet__how";
        how.textContent =
          "追加と削除はGitHubの画面で受け付けます。開いた画面の url: の右に" +
          "RSSのURLを書いて送信してください。次の朝の更新で反映されます。";
        box.appendChild(how);
        feedListEl.appendChild(box);
      }
    }).catch(function (e) {
      notify("フィード一覧を読み込めませんでした", e.message, "error");
    });
  }

  /* いまどのWi-Fiにつながっているかを画面の下に出す。
     公共Wi-Fiで使ってしまったことに気づけるのは、これが見えているときだけ。 */
  function showWifi(name) {
    if (!name) {
      wifiEl.textContent =
        "Wi-Fi名を確認できませんでした。公共Wi-Fiでは使わないでください。";
      return;
    }
    wifiEl.textContent =
      "接続中のWi-Fi: " + name + "　（自宅など信頼できる回線でお使いください）";
  }

  function checkStatus() {
    // GitHub Pages版はサーバーが無いので、確かめられる状態が無い
    if (API.isStatic) return Promise.resolve(null);

    return API.getStatus().then(function (status) {
      if (!status.ollama.running || !status.ollama.model_ready) {
        notify("要約はいまできません", status.ollama.detail);
      } else {
        clearNotices();
      }
      showWifi(status.wifi);
      return status;
    }).catch(function () { return null; });
  }

  /* GitHub Pages版では、Macが必要な操作を画面から消す。
     押せないボタンを残しておくより、無いほうが迷わない。 */
  function applyStaticMode(paper) {
    // 紙面を作るのはMacの仕事なので、このボタンだけ消す。
    // フィードの確認はここでもできるようにしておく
    // 静的版ではツールバーの中身が空になるので、帯ごと消す。
    // 空の帯が本文の上に居座って場所を取っていた
    const bar = buildBtn.closest(".toolbar");
    if (bar) bar.remove(); else buildBtn.remove();
    addFeedForm.remove();
    showFreshness(paper);
  }

  /* いつ作られた紙面かを出す。古いままなら、それと分かるようにする。
     自動更新が止まっていることに気づける唯一の手がかりなので消さない。 */
  function showFreshness(paper) {
    const issued = paper && paper.generated_at ? new Date(paper.generated_at) : null;
    if (!issued || isNaN(issued.getTime())) {
      wifiEl.textContent = "この紙面はMacで作られた控えです。";
      return;
    }

    const clock = String(issued.getHours()).padStart(2, "0") + ":" +
                  String(issued.getMinutes()).padStart(2, "0");
    const hours = (Date.now() - issued.getTime()) / 3600000;
    const sameDay = issued.toDateString() === new Date().toDateString();
    const when = sameDay
      ? "今日 " + clock
      : (issued.getMonth() + 1) + "月" + issued.getDate() + "日 " + clock;

    if (hours >= 24) {
      wifiEl.textContent = "⚠ この紙面は " + when + " のものです（" +
        Math.floor(hours / 24) + "日前）。自動更新が止まっているかもしれません。";
      wifiEl.style.color = "var(--danger)";
      return;
    }
    wifiEl.style.color = "";
    wifiEl.textContent = hours >= 12
      ? "この紙面は " + when + " のものです。次の更新は明朝6時半です。"
      : "この紙面は " + when + " に作られました。";
  }

  function showProgress(state) {
    const total = state.total || 0;
    const done = state.done || 0;
    progressEl.hidden = false;
    progressFill.style.width = total ? Math.round((done / total) * 100) + "%" : "0%";
    const label = STAGE_LABEL[state.stage] || state.message || "処理中";
    progressText.textContent = total
      ? label + "　" + done + " / " + total + " 件"
      : label;
  }

  function onState(state) {
    if (state.stage === "done" || state.stage === "error") {
      progressEl.hidden = true;
      buildBtn.disabled = false;
      if (stream) { stream.close(); stream = null; }
      loadPaper();
      if (state.stage === "error") {
        notify("処理を最後まで進められませんでした", state.message, "error");
      } else if (state.message) {
        notify("できました", state.message);
      }
      return;
    }
    if (state.running) showProgress(state);
  }

  function startBuild() {
    buildBtn.disabled = true;
    clearNotices();
    if (stream) { stream.close(); }
    stream = API.openStream(onState);
    return API.startBuild().catch(function (e) {
      buildBtn.disabled = false;
      progressEl.hidden = true;
      if (stream) { stream.close(); stream = null; }
      notify("始められませんでした", e.message, "error");
    });
  }

  if (!API.isStatic) {
    buildBtn.addEventListener("click", startBuild);
  }

  /* 紙面の色（白/黒）。ふだんはOSの設定に従い、ボタンで選んだら
     その色を覚える（このブラウザの中だけに保存。外部には送らない）。 */
  const themeBtn = document.getElementById("toggle-theme");
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

  function currentTheme() {
    const chosen = document.documentElement.dataset.theme;
    if (chosen === "light" || chosen === "dark") return chosen;
    return darkQuery.matches ? "dark" : "light";
  }

  function refreshTheme() {
    themeBtn.textContent =
      currentTheme() === "dark" ? "白い紙面にする" : "黒い紙面にする";
    // iOSのステータスバーの色も紙面に合わせる
    const bar = currentTheme() === "dark" ? "#0d0d0f" : "#fffdf8";
    [].forEach.call(
      document.querySelectorAll('meta[name="theme-color"]'),
      function (meta) { meta.content = bar; }
    );
  }

  themeBtn.addEventListener("click", function () {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("shimen-theme", next); } catch (e) {}
    refreshTheme();
  });

  // OS側の設定が変わったとき、ボタンの文言を追従させる
  if (darkQuery.addEventListener) {
    darkQuery.addEventListener("change", refreshTheme);
  }
  refreshTheme();

  document.getElementById("open-settings").addEventListener("click", function () {
    settingsEl.hidden = false;
    loadFeeds();
  });

  document.getElementById("close-settings").addEventListener("click", function () {
    settingsEl.hidden = true;
    if (!API.isStatic) loadPaper();
  });

  addFeedForm.addEventListener("submit", function (event) {
    event.preventDefault();
    const url = feedUrlInput.value.trim();
    if (!url) return;
    addFeedError.hidden = true;
    addFeedSubmit.disabled = true;
    addFeedSubmit.textContent = "確認中...";

    API.addFeed(url).then(function () {
      feedUrlInput.value = "";
      loadFeeds();
    }).catch(function (e) {
      addFeedError.textContent = e.message;
      addFeedError.hidden = false;
    }).finally(function () {
      addFeedSubmit.disabled = false;
      addFeedSubmit.textContent = "追加する";
    });
  });

  // 初回表示
  loadPaper().then(function (paper) {
    if (API.isStatic) {
      applyStaticMode(paper);
      return null;
    }
    return checkStatus();
  });
})();
