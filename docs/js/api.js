/* サーバーとのやりとり。鍵はCookieで運ばれるので明示的な付与は不要。
   URLに ?k= が付いている初回だけ、Cookieが設定される。

   GitHub Pages版は window.STATIC_MODE = true で読み込まれる。
   そのときサーバーは無いので、書き出し済みの data/paper.json を読み、
   既読はこの端末の中（localStorage）だけに覚える。 */
(function () {
  "use strict";

  const STATIC = window.STATIC_MODE === true;
  const READ_KEY = "shimen.read";

  function readIds() {
    try {
      return new Set(JSON.parse(localStorage.getItem(READ_KEY) || "[]"));
    } catch (e) {
      return new Set();
    }
  }

  function rememberRead(id) {
    const ids = readIds();
    ids.add(id);
    try {
      localStorage.setItem(READ_KEY, JSON.stringify([...ids]));
    } catch (e) { /* 保存できなくても読むことはできる */ }
  }

  function applyReadState(paper) {
    const ids = readIds();
    const mark = (a) => { if (a) a.is_read = ids.has(a.id); return a; };
    mark(paper.lead);
    (paper.seconds || []).forEach(mark);
    (paper.items || []).forEach(mark);
    return paper;
  }

  async function request(path, options) {
    const response = await fetch(path, Object.assign({
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
    }, options || {}));

    if (response.status === 204) return null;

    let body = null;
    try { body = await response.json(); } catch (e) { body = null; }

    if (!response.ok) {
      const detail = (body && body.detail) || "うまくいきませんでした";
      const error = new Error(detail);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  /* --- GitHub Pages版。サーバーが無いので書き出し済みJSONを読む --- */
  const staticApi = {
    isStatic: true,

    getPaper: async function () {
      const response = await fetch("data/paper.json", { cache: "no-cache" });
      if (!response.ok) throw new Error("紙面データを読み込めませんでした");
      return applyReadState(await response.json());
    },

    // サーバーが無いので、Ollamaの状態もWi-Fi名も確かめようがない
    getStatus: async () => ({ ollama: { running: true, model_ready: true },
                              wifi: null, static: true }),

    markRead: async function (id) { rememberRead(id); },

    // フィード一覧は紙面JSONに入っている（名前と状態だけ。URLは公開しない）
    listFeeds: async function () {
      const response = await fetch("data/paper.json", { cache: "no-cache" });
      if (!response.ok) throw new Error("フィード一覧を読み込めませんでした");
      const paper = await response.json();
      return { feeds: (paper.feeds || []).map(function (f, i) {
        return { id: i, title: f.title, url: "", priority: f.priority,
                 last_error: f.last_error, readonly: true };
      }) };
    },

    // 追加・削除・優先度の変更はMacの画面から行う
    addFeed: async () => { throw new Error("この画面からは追加できません"); },
    deleteFeed: async () => { throw new Error("この画面からは削除できません"); },
    setPriority: async () => { throw new Error("この画面からは変更できません"); },
    startBuild: async () => { throw new Error("紙面の更新はMacで行ってください"); },
    resummarize: async () => { throw new Error("紙面の更新はMacで行ってください"); },
    openStream: () => ({ close: function () {} }),
  };

  const serverApi = {
    isStatic: false,
    getPaper: () => request("/api/paper"),
    getStatus: () => request("/api/status"),
    listFeeds: () => request("/api/feeds"),
    addFeed: (url) => request("/api/feeds", {
      method: "POST", body: JSON.stringify({ url: url }),
    }),
    deleteFeed: (id) => request("/api/feeds/" + id, { method: "DELETE" }),
    setPriority: (id, priority) => request("/api/feeds/" + id, {
      method: "PATCH", body: JSON.stringify({ priority: priority }),
    }),
    startBuild: () => request("/api/build", { method: "POST" }),
    markRead: (id) => request("/api/articles/" + id + "/read", { method: "POST" }),
    resummarize: (id) =>
      request("/api/articles/" + id + "/resummarize", { method: "POST" }),

    openStream: function (onState) {
      const source = new EventSource("/api/build/stream", { withCredentials: true });
      source.onmessage = function (event) {
        try { onState(JSON.parse(event.data)); } catch (e) { /* 壊れた行は捨てる */ }
      };
      source.onerror = function () { source.close(); };
      return source;
    },
  };

  /* GitHubのIssue作成画面を中身入りで開くURLを作る。
     Pagesは静的なのでMacのデータベースを直接は書けない。
     ユーザー自身のGitHubアカウントを書き込み経路として使う。 */
  window.requestUrl = function (action, value) {
    const repo = window.SHIMEN_REPO || "";
    if (!repo) return null;
    const isAdd = action === "add";
    const title = isAdd ? "フィード追加の依頼" : "フィード削除の依頼: " + value;
    const body = isAdd
      ? "shimen-request: add\nurl: " + value
      : "shimen-request: remove\ntitle: " + value;
    return "https://github.com/" + repo + "/issues/new"
      + "?labels=" + encodeURIComponent(window.SHIMEN_LABEL || "feed-request")
      + "&title=" + encodeURIComponent(title)
      + "&body=" + encodeURIComponent(body);
  };

  window.API = STATIC ? staticApi : serverApi;
})();
