var PassageSearch = {
	id: null,
	rootURI: null,
	_windows: new Set(),

	init({ id, version, rootURI }) {
		this.id = id;
		this.version = version;
		this.rootURI = rootURI;
	},

	addToAllWindows() {
		for (const win of Zotero.getMainWindows()) {
			this.addToWindow(win);
		}
	},

	addToWindow(window) {
		if (!window || window.__passageSearch) return;
		const doc = window.document;
		const anchor = doc.getElementById('zotero-tb-search')
			|| doc.querySelector('quick-search-textbox');
		const tree = doc.getElementById('zotero-items-tree')
			|| doc.querySelector('item-tree');
		const pane = doc.getElementById('zotero-items-pane')
			|| (tree && tree.parentNode)
			|| (anchor && anchor.parentNode);
		if (!pane) {
			Zotero.debug('Preview Search Results: item pane not found');
			return;
		}

		const box = doc.createXULElement('hbox');
		box.id = 'passage-search-box';
		box.setAttribute('align', 'center');
		const input = doc.createXULElement('search-textbox');
		input.id = 'passage-search-input';
		input.setAttribute('placeholder', 'Search this collection');
		input.setAttribute('aria-label', 'Search this collection');
		const funnel = iconButton(doc, 'passage-search-funnel', 'Search this collection options');
		funnel.setAttribute('aria-pressed', 'false');
		const funnelMark = doc.createXULElement('image');
		funnelMark.id = 'passage-search-funnel-mark';
		funnelMark.setAttribute('src', 'chrome://zotero/skin/16/universal/filter.svg');
		funnel.appendChild(funnelMark);
		box.append(input, funnel);

		const options = doc.createElement('div');
		options.id = 'passage-search-options';
		options.hidden = true;
		const caseLabel = doc.createElement('label');
		const caseBox = doc.createElement('input');
		caseBox.type = 'checkbox';
		caseBox.id = 'passage-search-case';
		caseLabel.append(caseBox, doc.createTextNode(' Match case'));
		const modeLabel = doc.createElement('label');
		modeLabel.append(doc.createTextNode('Match '));
		const mode = doc.createElement('select');
		mode.id = 'passage-search-mode';
		for (const [value, label] of [
			['whole', 'Whole word'],
			['prefix', 'Starts with'],
			['anywhere', 'Anywhere in a word'],
		]) {
			const option = doc.createElement('option');
			option.value = value;
			option.textContent = label;
			mode.appendChild(option);
		}
		modeLabel.appendChild(mode);
		const optionsSearch = button(doc, 'Search', 'Search with these settings');
		const optionsClear = button(doc, 'Clear', 'Reset match settings');
		const optionsClose = button(doc, '\u00d7', 'Close match settings');
		options.append(caseLabel, modeLabel, optionsSearch, optionsClear, optionsClose);

		const results = columnBox(doc);
		results.id = 'passage-search-results';
		results.hidden = true;
		results.setAttribute('flex', '1');

		if (anchor && anchor.parentNode) {
			anchor.parentNode.insertBefore(box, anchor);
		} else {
			pane.insertBefore(box, pane.firstChild);
		}
		if (input.inputField) {
			input.inputField.placeholder = 'Search this collection';
			input.inputField.setAttribute('aria-label', 'Search this collection');
		}
		const listParent = tree ? tree.parentNode : pane;
		if (tree) {
			listParent.insertBefore(options, tree);
			listParent.insertBefore(results, tree);
		} else {
			pane.append(options, results);
		}

		const state = {
			window,
			doc,
			input,
			caseBox,
			mode,
			options,
			results,
			tree,
			pane,
			box,
			token: 0,
			showing: false,
			onSelect: () => {
				if (!state.showing) return;
				state.token += 1;
				restore(state);
			},
		};
		window.__passageSearch = state;
		this._windows.add(window);

		const collections = doc.getElementById('zotero-collections-tree');
		if (collections) {
			collections.addEventListener('select', state.onSelect);
			state.collections = collections;
		}

		state.onResize = () => {
			if (state.showing) fitResults(state);
		};
		window.addEventListener('resize', state.onResize);

		const onKey = (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				run(state);
			}
		};
		input.addEventListener('keydown', onKey);
		if (input.inputField) input.inputField.addEventListener('keydown', onKey);
		input.addEventListener('click', (event) => {
			const target = event.originalTarget || event.target;
			const part = target && target.getAttribute && target.getAttribute('part');
			const cls = target && target.classList;
			if (part === 'search-icon' || part === 'search-sign' || (cls && cls.contains('textbox-search-icon'))) {
				run(state);
			}
			if (part === 'search-clear' || (cls && cls.contains('textbox-search-clear'))) {
				state.token += 1;
				input.value = '';
				restore(state);
			}
		});
		optionsSearch.addEventListener('click', () => run(state));
		funnel.addEventListener('click', () => {
			options.hidden = !options.hidden;
			funnel.setAttribute('aria-pressed', String(!options.hidden));
		});
		optionsClose.addEventListener('click', () => {
			options.hidden = true;
			funnel.setAttribute('aria-pressed', 'false');
		});
		optionsClear.addEventListener('click', () => {
			caseBox.checked = false;
			mode.value = 'whole';
		});
		input.addEventListener('search', () => {
			if (!input.value) {
				state.token += 1;
				restore(state);
			}
		});

		const link = doc.createElement('link');
		link.id = 'passage-search-style';
		link.rel = 'stylesheet';
		link.href = this.rootURI + 'content/style.css';
		doc.documentElement.appendChild(link);
		state.link = link;
	},

	removeFromWindow(window) {
		const state = window && window.__passageSearch;
		if (!state) return;
		state.token += 1;
		if (state.collections) {
			state.collections.removeEventListener('select', state.onSelect);
		}
		if (state.onResize) {
			window.removeEventListener('resize', state.onResize);
		}
		restore(state);
		for (const node of [state.box, state.options, state.results, state.link]) {
			if (node && node.remove) node.remove();
		}
		delete window.__passageSearch;
		this._windows.delete(window);
	},

	removeFromAllWindows() {
		for (const win of Array.from(this._windows)) {
			this.removeFromWindow(win);
		}
	},
};

function button(doc, label, title) {
	const el = doc.createElement('button');
	el.type = 'button';
	el.textContent = label;
	el.title = title;
	return el;
}

function iconButton(doc, id, title) {
	const el = doc.createXULElement('toolbarbutton');
	el.id = id;
	el.className = 'zotero-clicky';
	el.setAttribute('type', 'button');
	el.setAttribute('tabindex', '0');
	el.setAttribute('tooltiptext', title);
	el.setAttribute('aria-label', title);
	return el;
}

function fitResults(state) {
	const pane = state.pane;
	if (!pane) return;
	const paneRect = pane.getBoundingClientRect();
	const bar = state.options && !state.options.hidden ? state.options : state.box;
	const barRect = bar.getBoundingClientRect();
	let top = barRect.bottom - paneRect.top;
	if (top < 0 || top > paneRect.height * 0.6) top = 0;
	const results = state.results;
	results.style.position = 'absolute';
	results.style.left = '0';
	results.style.right = '0';
	results.style.top = `${top}px`;
	results.style.bottom = '0';
	results.style.width = 'auto';
	results.style.maxWidth = '100%';
	results.style.overflowX = 'hidden';
	results.style.overflowY = 'auto';
}

function restore(state) {
	state.showing = false;
	state.results.hidden = true;
	state.results.replaceChildren();
	if (state.pane) state.pane.classList.remove('passage-search-active');
}

async function run(state) {
	const query = state.input.value.trim();
	if (!query) return;
	const token = ++state.token;
	state.showing = true;
	if (state.pane) state.pane.classList.add('passage-search-active');
	state.results.hidden = false;
	fitResults(state);
	state.results.replaceChildren();
	const summary = state.doc.createElement('div');
	summary.className = 'passage-search-summary';
	summary.textContent = 'Searching\u2026';
	state.results.appendChild(summary);

	const matchCase = state.caseBox.checked;
	const mode = state.mode.value;
	try {
		const result = await searchLibrary(query, { matchCase, mode }, () => token === state.token, (scanned) => {
			if (token !== state.token) return;
			summary.textContent = `Searching\u2026 ${scanned} file${scanned === 1 ? '' : 's'}`;
		});
		if (token !== state.token) return;
		renderBooks(state, result.books, summary, result.scanned);
		fitResults(state);
	} catch (error) {
		Zotero.logError(error);
		if (token !== state.token) return;
		summary.textContent = 'Search failed. See the error console.';
	}
}

async function searchLibrary(query, options, alive, onProgress) {
	const zp = Zotero.getActiveZoteroPane();
	const selected = zp.getSelectedCollections();
	const libraryIDs = selected.length
		? [...new Set(selected.map((collection) => collection.libraryID))]
		: (zp.getSelectedLibraryIDs() || []);
	const libraryList = libraryIDs.length
		? libraryIDs
		: [Zotero.Libraries.userLibraryID];
	const books = new Map();
	const seenFiles = new Set();
	let scanned = 0;
	for (const libraryID of libraryList) {
		const collections = selected.filter((collection) => collection.libraryID === libraryID);
		const ids = await candidateAttachmentIds(libraryID, collections, query, options.mode);
		const items = await Zotero.Items.getAsync(ids || []);
		for (const item of items) {
			if (!alive()) return { scanned, books: [] };
			const files = filesOf(item);
			for (const file of files) {
				if (!alive()) return { scanned, books: [] };
				if (!file || seenFiles.has(file.id)) continue;
				seenFiles.add(file.id);
				if (file.attachmentLinkMode === Zotero.Attachments.LINK_MODE_LINKED_URL) continue;
				scanned += 1;
				onProgress(scanned);
				let text = '';
				try {
					text = await readExtractedText(file);
				} catch (error) {
					Zotero.logError(error);
				}
				if (!text) continue;
				const passages = PassageSnippets.findPassages(text, query, options);
				if (!passages.length) continue;
				const parent = file.parentItemID ? Zotero.Items.get(file.parentItemID) : file;
				let book = books.get(parent.id);
				if (!book) {
					book = { parent, passages: [] };
					books.set(parent.id, book);
				}
				const labelInfo = await Promise.race([
					loadPageLabels(file),
					Zotero.Promise.delay(4000).then(() => ({ labels: null, total: null })),
				]);
				const fileTotal = labelInfo.total || text.split('\f').length;
				for (const passage of passages) {
					if (Number.isInteger(passage.pageIndex)) {
						passage.filePage = passage.pageIndex + 1;
						passage.fileTotal = fileTotal;
						const printed = labelInfo.labels && labelInfo.labels[passage.pageIndex];
						passage.printedLabel = printed && String(printed) !== String(passage.filePage)
							? String(printed)
							: '';
					}
					book.passages.push({ passage, attachment: file });
				}
				await Zotero.Promise.delay(0);
			}
		}
	}
	return {
		scanned,
		books: [...books.values()].sort((a, b) => {
			const byCount = b.passages.length - a.passages.length;
			if (byCount) return byCount;
			return titleOf(a.parent).localeCompare(titleOf(b.parent));
		}),
	};
}

async function candidateAttachmentIds(libraryID, collections, query, mode) {
	const scope = await attachmentIdsInScope(libraryID, collections);
	const quoted = typeof PassageSnippets !== 'undefined' && PassageSnippets.quotedPhrase && PassageSnippets.quotedPhrase(query);
	if (mode === 'anywhere' || quoted || !scope.length || !Zotero.Fulltext.findItemsWithContent) {
		return scope;
	}
	try {
		const found = await Zotero.Fulltext.findItemsWithContent(query, libraryID, scope);
		if (Array.isArray(found) && found.length) return found;
	} catch (error) {
		Zotero.logError(error);
	}
	return scope;
}

async function attachmentIdsInScope(libraryID, collections) {
	if (!collections.length) {
		const search = new Zotero.Search();
		search.libraryID = libraryID;
		search.addCondition('itemType', 'is', 'attachment');
		search.addCondition('resultLevel', 'attachment');
		return (await search.search()) || [];
	}
	const ids = new Set();
	for (const collection of collections) {
		for (const row of collection.getDescendents(false, 'item')) {
			const item = Zotero.Items.get(row.id);
			if (!item || item.deleted) continue;
			if (item.isAttachment()) ids.add(item.id);
			else if (item.getAttachments) {
				for (const id of item.getAttachments()) ids.add(id);
			}
		}
	}
	return [...ids];
}

function filesOf(item) {
	if (!item) return [];
	if (item.isAttachment()) return [item];
	if (item.isRegularItem && item.isRegularItem()) {
		return Zotero.Items.get(item.getAttachments());
	}
	return [];
}

async function pathExists(path) {
	if (typeof IOUtils !== 'undefined' && IOUtils.exists) return IOUtils.exists(path);
	if (typeof OS !== 'undefined' && OS.File) return OS.File.exists(path);
	return false;
}

async function readExtractedText(item) {
	const cache = Zotero.Fulltext.getItemCacheFile(item);
	const path = cache.path || String(cache);
	if (await pathExists(path)) {
		return Zotero.File.getContentsAsync(path, 'utf-8');
	}
	if (Zotero.MIME.isTextType(item.attachmentContentType)) {
		const filePath = await item.getFilePathAsync();
		if (!filePath) return '';
		return Zotero.File.getContentsAsync(filePath, item.attachmentCharset || 'utf-8');
	}
	return '';
}

function renderBooks(state, books, summary, scanned) {
	const total = books.reduce((sum, book) => sum + book.passages.length, 0);
	if (!total) {
		summary.textContent = scanned
			? `No passages in ${scanned} file${scanned === 1 ? '' : 's'}.`
			: 'No files were searched in this collection.';
		return;
	}
	summary.textContent = `${total} passage${total === 1 ? '' : 's'} in ${books.length} book${books.length === 1 ? '' : 's'}`;
	for (const book of books) {
		const bookBox = columnBox(state.doc);
		bookBox.className = 'passage-search-book';
		const head = state.doc.createElement('div');
		head.className = 'passage-search-book-head';
		head.setAttribute('role', 'button');
		head.setAttribute('aria-expanded', 'true');
		const twisty = state.doc.createElement('span');
		twisty.className = 'icon icon-css icon-twisty twisty open';
		twisty.setAttribute('aria-hidden', 'true');
		const icon = itemTypeIcon(state.doc, book.parent);
		const title = state.doc.createElement('div');
		title.className = 'passage-search-title';
		title.textContent = titleOf(book.parent);
		const creator = state.doc.createElement('div');
		creator.className = 'passage-search-meta';
		creator.textContent = creatorOf(book.parent);
		const added = state.doc.createElement('div');
		added.className = 'passage-search-meta';
		added.textContent = addedOf(book.parent);
		const count = state.doc.createElement('div');
		count.className = 'passage-search-count';
		count.textContent = String(book.passages.length);
		head.append(twisty, icon, title, creator, added, count);
		head.addEventListener('click', () => {
			const collapsed = bookBox.classList.toggle('collapsed');
			twisty.classList.toggle('open', !collapsed);
			head.setAttribute('aria-expanded', String(!collapsed));
		});
		bookBox.appendChild(head);
		const children = state.doc.createElement('div');
		children.className = 'passage-search-children';
		bookBox.appendChild(children);

		const fileIds = new Set(book.passages.map((entry) => entry.attachment.id));
		const showFile = fileIds.size > 1;
		const ordered = book.passages.slice().sort((a, b) => {
			const files = (a.attachment.attachmentFilename || '').localeCompare(b.attachment.attachmentFilename || '');
			if (files) return files;
			return (a.passage.pageIndex ?? -1) - (b.passage.pageIndex ?? -1);
		});
		const first = ordered.slice(0, 10);
		for (const entry of first) {
			children.appendChild(passageRow(state, entry, showFile));
		}
		if (ordered.length > 10) {
			const more = button(state.doc, `Show the rest (${ordered.length - 10})`, 'Show every remaining passage in this book');
			more.className = 'passage-search-more';
			more.addEventListener('click', () => {
				const rest = ordered.slice(10).map((entry) => passageRow(state, entry, showFile));
				for (const row of rest) more.before(row);
				more.remove();
				stripePassages(children);
			});
			children.appendChild(more);
		}
		stripePassages(children);
		state.results.appendChild(bookBox);
	}
}

function itemTypeIcon(doc, item) {
	const icon = doc.createElement('span');
	icon.className = 'icon icon-css icon-item-type';
	let name = 'document';
	try {
		name = item.getItemTypeIconName() || Zotero.ItemTypes.getName(item.itemTypeID) || name;
	} catch (error) {
		name = 'document';
	}
	icon.dataset.itemType = name;
	return icon;
}

function stripePassages(container) {
	const rows = container.querySelectorAll('.passage-search-passage');
	rows.forEach((row, index) => {
		row.classList.toggle('even', index % 2 === 0);
		row.classList.toggle('odd', index % 2 === 1);
	});
}

function columnBox(doc) {
	const el = doc.createElement('div');
	el.style.maxWidth = '100%';
	el.style.minWidth = '0';
	return el;
}

function passageRow(state, entry, showFile) {
	const { passage, attachment } = entry;
	const row = state.doc.createElement('div');
	row.className = 'passage-search-passage';
	row.title = 'Open this page';
	const body = state.doc.createElement('div');
	body.className = 'passage-search-body';
	const pageLabel = pageTagText(passage);
	if (pageLabel || showFile) {
		const tag = state.doc.createElement('span');
		tag.className = 'passage-search-page';
		const file = showFile ? (attachment.attachmentFilename || 'File') : '';
		if (passage.printedLabel) {
			const printed = state.doc.createElement('span');
			printed.className = 'passage-search-printed';
			printed.textContent = passage.printedLabel;
			tag.appendChild(printed);
		}
		tag.appendChild(state.doc.createTextNode(pageLabel || file));
		body.appendChild(tag);
	}
	appendPiece(state.doc, body, passage.before, false);
	if (passage.before) body.appendChild(state.doc.createTextNode(' '));
	appendPiece(state.doc, body, passage.match, true);
	if (passage.after) body.appendChild(state.doc.createTextNode(' '));
	appendPiece(state.doc, body, passage.after, false);
	row.appendChild(body);
	row.addEventListener('click', () => openPassage(state, attachment, passage, row));
	return row;
}

function appendPiece(doc, parent, text, hit) {
	if (!text) return;
	const node = hit ? doc.createElement('span') : doc.createTextNode(text);
	if (!hit) {
		parent.appendChild(node);
		return;
	}
	node.className = 'passage-search-hit';
	node.textContent = text;
	parent.appendChild(node);
}

function pageTagText(passage) {
	if (!passage.filePage) return passage.pageLabel || '';
	const fileText = passage.fileTotal ? `${passage.filePage} / ${passage.fileTotal}` : String(passage.filePage);
	return passage.printedLabel ? ` ${fileText}` : fileText;
}

function openPageIndex(passage) {
	if (!Number.isInteger(passage.pageIndex)) return null;
	return passage.pageIndex;
}

async function openPassage(state, attachment, passage, row) {
	const guessIndex = openPageIndex(passage);
	const location = guessIndex == null ? undefined : { pageIndex: guessIndex };
	let reader = await Zotero.Reader.open(attachment.id, location);
	if (!reader && Zotero.Reader._readers) {
		reader = Zotero.Reader._readers.find((candidate) => candidate.itemID === attachment.id && !candidate._isTabClosed);
	}
	let pageIndex = guessIndex;
	let pdfDoc = null;
	let focused = false;
	if (reader) {
		const found = await focusPassage(reader, passage);
		if (found) {
			pageIndex = found.pageIndex;
			pdfDoc = found.doc;
			focused = true;
		} else {
			const scanned = await findPageIndex(reader, passage, guessIndex);
			if (scanned) {
				pageIndex = scanned.pageIndex;
				pdfDoc = scanned.doc;
			}
		}
	}
	if (!focused && reader && Number.isInteger(pageIndex) && reader.navigate) {
		reader.navigate({ pageIndex });
	}
	if (row && pdfDoc && Number.isInteger(pageIndex)) {
		await showFoundPage(row, pdfDoc, pageIndex);
	}
	if (reader) await highlightWord(reader, passage, pageIndex);
}

function squashFocus(text) {
	return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function focusFingerprint(passage) {
	const word = squashFocus(passage.match);
	const after = squashFocus(String(passage.after || '').slice(0, 48));
	return (word + after).slice(0, 40);
}

function nearbyPages(guess, count, radius) {
	const order = [];
	const push = (pageNumber) => {
		if (pageNumber >= 1 && pageNumber <= count && !order.includes(pageNumber)) order.push(pageNumber);
	};
	push(guess);
	for (let distance = 1; distance <= radius; distance++) {
		push(guess - distance);
		push(guess + distance);
	}
	return order;
}

function squashMap(text) {
	let out = '';
	const map = [];
	const source = String(text || '').toLowerCase();
	for (let i = 0; i < source.length;) {
		const ch = String.fromCodePoint(source.codePointAt(i));
		if (/[a-z0-9]/.test(ch)) {
			out += ch;
			map.push(i);
		}
		i += ch.length;
	}
	return { out, map };
}

function itemRect(item) {
	const transform = item && item.transform;
	if (!transform || transform.length < 6) return null;
	const x = transform[4];
	const y = transform[5];
	const width = item.width || 0;
	const height = Math.hypot(transform[2], transform[3]) || item.height || 0;
	if (!width && !height) return null;
	return [x, y, x + width, y + height];
}

async function rectsForFingerprint(doc, pageNumber, fingerprint) {
	const page = await waive(doc).getPage(pageNumber);
	const content = await waive(page).getTextContent();
	const items = waive(content).items;
	let raw = '';
	const pieces = [];
	const count = items.length;
	for (let i = 0; i < count; i++) {
		const item = waive(items[i]);
		const start = raw.length;
		raw += item.str || '';
		if (item.hasEOL) raw += '\n';
		pieces.push({ start, end: raw.length, rect: itemRect(item) });
	}
	const collapsed = squashMap(raw);
	const at = collapsed.out.indexOf(fingerprint);
	if (at < 0) return null;
	const from = collapsed.map[at];
	const to = collapsed.map[Math.min(collapsed.out.length - 1, at + fingerprint.length - 1)] + 1;
	const rects = [];
	for (const piece of pieces) {
		if (!piece.rect) continue;
		if (piece.end > from && piece.start < to) rects.push(piece.rect);
	}
	return { rects };
}

function pdfView(reader) {
	return reader && reader._internalReader && reader._internalReader._primaryView || null;
}

async function focusPassage(reader, passage) {
	const view = pdfView(reader);
	if (!view || typeof view.navigate !== 'function') return null;
	try {
		await view.initializedPromise;
	} catch (error) {
		Zotero.logError(error);
	}
	const fingerprint = focusFingerprint(passage);
	if (!fingerprint) return null;
	let doc = null;
	for (let attempt = 0; attempt < 40; attempt++) {
		doc = waive(view._iframeWindow?.PDFViewerApplication?.pdfDocument);
		if (doc && doc.numPages) break;
		doc = null;
		await Zotero.Promise.delay(100);
	}
	if (!doc) return null;
	const guess = Number.isInteger(passage.pageIndex) ? passage.pageIndex + 1 : 1;
	for (const pageNumber of nearbyPages(guess, doc.numPages, 3)) {
		let hit = null;
		try {
			hit = await rectsForFingerprint(doc, pageNumber, fingerprint);
		} catch (error) {
			Zotero.logError(error);
			continue;
		}
		if (!hit) continue;
		const pageIndex = pageNumber - 1;
		const position = { pageIndex, rects: hit.rects };
		if (hit.rects.length) {
			view.navigate({ position }, { block: 'center', ifNeeded: false, skipHistory: true });
		} else {
			view.navigate({ pageIndex }, { skipHistory: true });
		}
		return { pageIndex, doc };
	}
	return null;
}

function waive(obj) {
	if (!obj) return obj;
	try {
		if (typeof Cu !== 'undefined' && Cu.waiveXrays) return Cu.waiveXrays(obj);
	} catch (error) {
		// The object is already usable.
	}
	return obj.wrappedJSObject || obj;
}

async function showFoundPage(row, doc, pageIndex) {
	const filePage = pageIndex + 1;
	const total = waive(doc).numPages;
	let labels = null;
	try {
		labels = await waive(doc).getPageLabels();
	} catch (error) {
		labels = null;
	}
	const printed = labels && labels[pageIndex] != null ? String(waive(labels[pageIndex])) : '';
	const tag = row.querySelector('.passage-search-page');
	if (!tag) return;
	tag.replaceChildren();
	const docNode = row.ownerDocument;
	if (printed && printed !== String(filePage)) {
		const pill = docNode.createElement('span');
		pill.className = 'passage-search-printed';
		pill.textContent = printed;
		tag.appendChild(pill);
		tag.appendChild(docNode.createTextNode(` ${filePage} / ${total}`));
	} else if (total) {
		tag.textContent = `${filePage} / ${total}`;
	} else {
		tag.textContent = String(filePage);
	}
}

const pageLabelCache = new Map();

async function loadPageLabels(item) {
	if (pageLabelCache.has(item.id)) return pageLabelCache.get(item.id);
	const empty = { labels: null, total: null };
	if (!item.isPDFAttachment || !item.isPDFAttachment()) {
		pageLabelCache.set(item.id, empty);
		return empty;
	}
	try {
		const path = await item.getFilePathAsync();
		if (!path) throw new Error('no file');
		const pdfjs = ChromeUtils.importESModule('resource://zotero/reader/pdf/build/pdf.mjs');
		const data = await IOUtils.read(path);
		const task = pdfjs.getDocument({ data, disableWorker: true, isEvalSupported: false });
		const doc = await task.promise;
		const labels = await doc.getPageLabels();
		const info = { labels, total: doc.numPages };
		await doc.destroy?.();
		pageLabelCache.set(item.id, info);
		return info;
	} catch (error) {
		Zotero.debug(`Preview Search Results page labels: ${error}`);
		pageLabelCache.set(item.id, empty);
		return empty;
	}
}

function squashMatch(text) {
	return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function pageSearchOrder(guess, count) {
	const order = [];
	const push = (pageNumber) => {
		if (pageNumber >= 1 && pageNumber <= count && !order.includes(pageNumber)) order.push(pageNumber);
	};
	push(guess);
	for (let distance = 1; distance <= 8; distance++) {
		push(guess + distance);
		push(guess - distance);
	}
	return order;
}

async function pagePlainText(doc, pageNumber) {
	const page = await waive(doc).getPage(pageNumber);
	const content = await waive(page).getTextContent();
	const items = waive(content).items;
	let out = '';
	const count = items.length;
	for (let i = 0; i < count; i++) {
		const item = waive(items[i]);
		out += item.str || '';
		if (item.hasEOL) out += '\n';
	}
	return out;
}

async function findPageIndex(reader, passage, guessIndex) {
	try {
		await reader._internalReader?._primaryView?.initializedPromise;
	} catch (error) {
		Zotero.logError(error);
	}
	const clues = passageClues(passage);
	if (!clues.word) return null;
	for (let attempt = 0; attempt < 30; attempt++) {
		const doc = waive(viewerWindow(reader)?.PDFViewerApplication?.pdfDocument);
		if (!doc || !doc.numPages) {
			await Zotero.Promise.delay(100);
			continue;
		}
		const guess = Number.isInteger(guessIndex) ? guessIndex + 1 : 1;
		let best = null;
		try {
			for (const pageNumber of pageSearchOrder(guess, doc.numPages)) {
				const text = squashMatch(await pagePlainText(doc, pageNumber));
				let score = 0;
				if (clues.follow.length >= 12 && text.includes(clues.follow)) score = 100;
				else if (clues.precede.length >= 12 && text.includes(clues.precede)) score = 40;
				if (score > (best?.score || 0)) best = { score, pageNumber };
				if (score === 100) break;
			}
		} catch (error) {
			Zotero.logError(error);
			return null;
		}
		if (!best) return null;
		return { pageIndex: best.pageNumber - 1, doc };
	}
	return null;
}

function passageClues(passage) {
	const word = squashMatch(passage.match);
	return {
		word,
		follow: squashMatch(word + (passage.after || '').slice(0, 40)),
		precede: squashMatch((passage.before || '').slice(-40) + word),
	};
}

function viewerWindow(reader) {
	return reader?._internalReader?._primaryView?._iframeWindow || reader?._iframeWindow || null;
}

async function highlightWord(reader, passage, pageIndex) {
	const word = passage.match;
	if (!word || !Number.isInteger(pageIndex)) return;
	try {
		await reader._internalReader?._primaryView?.initializedPromise;
	} catch (error) {
		Zotero.logError(error);
	}
	for (let attempt = 0; attempt < 50; attempt++) {
		const win = viewerWindow(reader);
		const app = win && win.PDFViewerApplication;
		const viewer = app && app.pdfViewer;
		const pageView = viewer && viewer._pages && viewer._pages[pageIndex];
		const layer = textLayerRoot(pageView);
		const spans = layer && [...layer.querySelectorAll('span')];
		if (viewer && spans && spans.length) {
			const target = markWordOnPage(spans, word, passage.before || '');
			if (target) {
				scrollSpanIntoViewer(viewer, target);
				clearTextSelection(win);
				return;
			}
		}
		if (viewer && viewer.scrollPageIntoView) {
			viewer.scrollPageIntoView({ pageNumber: pageIndex + 1 });
		}
		await Zotero.Promise.delay(100);
	}
}

function textLayerRoot(pageView) {
	if (!pageView) return null;
	const layer = pageView.textLayer?.div || pageView.div?.querySelector('.textLayer');
	if (!layer) return null;
	return layer.shadowRoot || layer;
}

function markWordOnPage(spans, word, before) {
	let acc = '';
	const pieces = [];
	for (const span of spans) {
		const start = acc.length;
		acc += span.textContent || '';
		pieces.push({ span, start, end: acc.length });
	}
	const hay = acc.toLowerCase();
	const needle = word.toLowerCase();
	const tail = before.toLowerCase().replace(/\s+/g, ' ').trim().slice(-50);
	let bestAt = -1;
	let bestScore = -1;
	let from = 0;
	while (from <= hay.length - needle.length) {
		const at = hay.indexOf(needle, from);
		if (at < 0) break;
		const lead = hay.slice(Math.max(0, at - 80), at).replace(/\s+/g, ' ').trim();
		let score = 0;
		while (score < tail.length && score < lead.length && tail[tail.length - 1 - score] === lead[lead.length - 1 - score]) {
			score++;
		}
		if (score > bestScore) {
			bestScore = score;
			bestAt = at;
		}
		from = at + Math.max(needle.length, 1);
	}
	if (bestAt < 0) return null;
	clearFocusMarks();
	let target = null;
	for (const piece of pieces) {
		if (piece.end > bestAt && piece.start < bestAt + needle.length) {
			paintFocus(piece.span);
			focusMarks.push(piece.span);
			if (!target) target = piece.span;
		}
	}
	return target;
}

const focusMarks = [];

function paintFocus(span) {
	span.style.setProperty('background', 'none', 'important');
	span.style.setProperty('background-color', 'transparent', 'important');
	span.style.setProperty('box-shadow', 'inset 0 -4px 0 #d10000', 'important');
	span.style.setProperty('border-radius', '0', 'important');
}

function clearFocusMarks() {
	for (const span of focusMarks) {
		try {
			span.style.removeProperty('background');
			span.style.removeProperty('background-color');
			span.style.removeProperty('color');
			span.style.removeProperty('-webkit-text-fill-color');
			span.style.removeProperty('box-shadow');
			span.style.removeProperty('border-radius');
		} catch (error) {
			// The page may already be gone.
		}
	}
	focusMarks.length = 0;
}

function clearTextSelection(win) {
	const windows = [win];
	try {
		if (win.parent && win.parent !== win) windows.push(win.parent);
	} catch (error) {
		// Cross-origin parent. The PDF frame is enough.
	}
	for (const view of windows) {
		try {
			const selection = view.getSelection && view.getSelection();
			if (selection && selection.removeAllRanges) selection.removeAllRanges();
		} catch (error) {
			// No selection in this frame.
		}
	}
}

function scrollSpanIntoViewer(viewer, span) {
	const container = viewer.container;
	if (!container) {
		span.scrollIntoView({ block: 'center', inline: 'nearest' });
		return;
	}
	const spanRect = span.getBoundingClientRect();
	const boxRect = container.getBoundingClientRect();
	container.scrollTop += spanRect.top - boxRect.top - (boxRect.height / 2) + (spanRect.height / 2);
}

function titleOf(item) {
	try {
		return item.getDisplayTitle() || item.getField('title') || 'Untitled';
	} catch (error) {
		return 'Untitled';
	}
}

function creatorOf(item) {
	try {
		return item.getField('firstCreator') || '';
	} catch (error) {
		return '';
	}
}

function addedOf(item) {
	const raw = item.dateAdded;
	if (!raw) return '';
	const date = new Date(raw);
	if (Number.isNaN(date.getTime())) return String(raw);
	return date.toLocaleString();
}
