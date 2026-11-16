var PassageSearch;

function install() {}

async function startup({ id, version, rootURI }) {
  Services.scriptloader.loadSubScript(rootURI + 'content/snippets.js');
  Services.scriptloader.loadSubScript(rootURI + 'content/passageSearch.js');
  PassageSearch.init({ id, version, rootURI });
  PassageSearch.addToAllWindows();
}

function onMainWindowLoad({ window }) {
  PassageSearch.addToWindow(window);
}

function onMainWindowUnload({ window }) {
  PassageSearch.removeFromWindow(window);
}

function shutdown() {
  if (typeof PassageSearch !== 'undefined' && PassageSearch) {
    PassageSearch.removeFromAllWindows();
    PassageSearch = undefined;
  }
}

function uninstall() {}
