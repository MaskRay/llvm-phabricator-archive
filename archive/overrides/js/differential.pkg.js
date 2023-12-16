JX.install('PhabricatorDragAndDropFileUpload', {
    construct: function (target) { if (JX.DOM.isNode(target)) { this._node = target; } else { this._sigil = target; } }, events: ['didBeginDrag', 'didEndDrag', 'willUpload', 'progress', 'didUpload', 'didError'], statics: { isSupported: function () { return !!window.FileList; }, isPasteSupported: function () { return !!window.FileList; } }, members: {
        _node: null, _sigil: null, _depth: 0, _isEnabled: false, setIsEnabled: function (bool) { this._isEnabled = bool; return this; }, getIsEnabled: function () { return this._isEnabled; }, _updateDepth: function (delta) { if (this._depth === 0 && delta > 0) { this.invoke('didBeginDrag', this._getTarget()); } this._depth += delta; if (this._depth === 0 && delta < 0) { this.invoke('didEndDrag', this._getTarget()); } }, _getTarget: function () { return this._target || this._node; }, start: function () {
            function
                contains(container, child) { do { if (child === container) { return true; } child = child.parentNode; } while (child); return false; } var
                    on_click = JX.bind(this, function (e) { if (!this.getIsEnabled()) { return; } if (this._depth) { e.kill(); this._updateDepth(-this._depth); } }); var
                        on_dragenter = JX.bind(this, function (e) {
                            if (!this.getIsEnabled()) { return; } if (!this._node) {
                                var
                                target = e.getNode(this._sigil); if (target !== this._target) { this._updateDepth(-this._depth); this._target = target; }
                            } if (contains(this._getTarget(), e.getTarget())) { this._updateDepth(1); }
                        }); var
                            on_dragleave = JX.bind(this, function (e) { if (!this.getIsEnabled()) { return; } if (!this._getTarget()) { return; } if (contains(this._getTarget(), e.getTarget())) { this._updateDepth(-1); } }); var
                                on_dragover = JX.bind(this, function (e) { if (!this.getIsEnabled()) { return; } e.getRawEvent().dataTransfer.dropEffect = 'copy'; e.kill(); }); var
                                    on_drop = JX.bind(this, function (e) {
                                        if (!this.getIsEnabled()) { return; } e.kill(); var
                                            files = e.getRawEvent().dataTransfer.files; for (var
                                                ii = 0; ii < files.length; ii++) { this.sendRequest(files[ii]); } this._updateDepth(-this._depth);
                                    }); if (this._node) { JX.DOM.listen(this._node, 'click', null, on_click); JX.DOM.listen(this._node, 'dragenter', null, on_dragenter); JX.DOM.listen(this._node, 'dragleave', null, on_dragleave); JX.DOM.listen(this._node, 'dragover', null, on_dragover); JX.DOM.listen(this._node, 'drop', null, on_drop); } else { JX.Stratcom.listen('click', this._sigil, on_click); JX.Stratcom.listen('dragenter', this._sigil, on_dragenter); JX.Stratcom.listen('dragleave', this._sigil, on_dragleave); JX.Stratcom.listen('dragover', this._sigil, on_dragover); JX.Stratcom.listen('drop', this._sigil, on_drop); } if (JX.PhabricatorDragAndDropFileUpload.isPasteSupported() && this._node) {
                                        JX.DOM.listen(this._node, 'paste', null, JX.bind(this, function (e) {
                                            if (!this.getIsEnabled()) { return; } var
                                                clipboard = e.getRawEvent().clipboardData; if (!clipboard) { return; } var
                                                    text = clipboard.getData('text/plain').toString(); if (text.length) { return; } if (!clipboard.items) { return; } for (var
                                                        ii = 0; ii < clipboard.items.length; ii++) {
                                                            var
                                                            item = clipboard.items[ii]; if (!/^image\//.test(item.type)) { continue; } var
                                                                spec = item.getAsFile(); if (!spec.name) { spec.name = 'pasted_file'; } this.sendRequest(spec);
                                            }
                                        }));
                                    } this.setIsEnabled(true);
        }, sendRequest: function (spec) {
            var
            file = new
                JX.PhabricatorFileUpload().setRawFileObject(spec).setName(spec.name).setTotalBytes(spec.size); var
                    threshold = this.getChunkThreshold(); if (threshold && (file.getTotalBytes() > threshold)) { this._allocateFile(file); } else { this._sendDataRequest(file); }
        }, _allocateFile: function (file) {
            file.setStatus('allocate').update(); this.invoke('willUpload', file); var
                alloc_uri = this._getUploadURI(file).setQueryParam('allocate', 1); new
                    JX.Workflow(alloc_uri).setHandler(JX.bind(this, this._didAllocateFile, file)).start();
        }, _getUploadURI: function (file) {
            var
            uri = JX.$U(this.getURI()).setQueryParam('name', file.getName()).setQueryParam('length', file.getTotalBytes()); if (this.getViewPolicy()) { uri.setQueryParam('viewPolicy', this.getViewPolicy()); } if (file.getAllocatedPHID()) { uri.setQueryParam('phid', file.getAllocatedPHID()); } return uri;
        }, _didAllocateFile: function (file, r) {
            var
            phid = r.phid; var
                upload = r.upload; if (!upload) { if (phid) { this._completeUpload(file, r); } else { this._failUpload(file, r); } return; } else { if (phid) { file.setAllocatedPHID(phid); this._loadChunks(file); } else { this._sendDataRequest(file); } }
        }, _loadChunks: function (file) {
            file.setStatus('chunks').update(); var
                chunks_uri = this._getUploadURI(file).setQueryParam('querychunks', 1); new
                    JX.Workflow(chunks_uri).setHandler(JX.bind(this, this._didLoadChunks, file)).start();
        }, _didLoadChunks: function (file, r) { file.setChunks(r); this._uploadNextChunk(file); }, _uploadNextChunk: function (file) {
            var
            chunks = file.getChunks(); var
                chunk; for (var
                    ii = 0; ii < chunks.length; ii++) { chunk = chunks[ii]; if (!chunk.complete) { this._uploadChunk(file, chunk); break; } }
        }, _uploadChunk: function (file, chunk, callback) {
            file.setStatus('upload').update(); var
                chunkup_uri = this._getUploadURI(file).setQueryParam('uploadchunk', 1).setQueryParam('__upload__', 1).setQueryParam('byteStart', chunk.byteStart).toString(); var
                    callback = JX.bind(this, this._didUploadChunk, file, chunk); var
                        req = new
                            JX.Request(chunkup_uri, callback); var
                                seen_bytes = 0; var
                                    onprogress = JX.bind(this, function (progress) { file.addUploadedBytes(progress.loaded - seen_bytes).update(); seen_bytes = progress.loaded; this.invoke('progress', file); }); req.listen('error', JX.bind(this, this._onUploadError, req, file)); req.listen('uploadprogress', onprogress); var
                                        blob = file.getRawFileObject().slice(chunk.byteStart, chunk.byteEnd); req.setRawData(blob).send();
        }, _didUploadChunk: function (file, chunk, r) { file.didCompleteChunk(chunk); if (r.complete) { this._completeUpload(file, r); } else { this._uploadNextChunk(file); } }, _sendDataRequest: function (file) {
            file.setStatus('uploading').update(); this.invoke('willUpload', file); var
                up_uri = this._getUploadURI(file).setQueryParam('__upload__', 1).toString(); var
                    onupload = JX.bind(this, function (r) { if (r.error) { this._failUpload(file, r); } else { this._completeUpload(file, r); } }); var
                        req = new
                            JX.Request(up_uri, onupload); var
                                onprogress = JX.bind(this, function (progress) { file.setTotalBytes(progress.total).setUploadedBytes(progress.loaded).update(); this.invoke('progress', file); }); req.listen('error', JX.bind(this, this._onUploadError, req, file)); req.listen('uploadprogress', onprogress); req.setRawData(file.getRawFileObject()).send();
        }, _completeUpload: function (file, r) { file.setID(r.id).setPHID(r.phid).setURI(r.uri).setMarkup(r.html).setStatus('done').setTargetNode(this._getTarget()).update(); this.invoke('didUpload', file); }, _failUpload: function (file, r) { file.setStatus('error').setError(r.error).update(); this.invoke('didError', file); }, _onUploadError: function (req, file, error) {
            file.setStatus('error'); if (error) { file.setError(error.code + ': ' + error.info); } else {
                var
                xhr = req.getTransport(); if (xhr.responseText) { file.setError('Server responded: ' + xhr.responseText); }
            } file.update(); this.invoke('didError', file);
        }
    }, properties: { URI: null, activatedClass: null, viewPolicy: null, chunkThreshold: null }
}); JX.install('PhabricatorShapedRequest', {
    construct: function (uri, callback, data_callback) { this._uri = uri; this._callback = callback; this._dataCallback = data_callback; }, events: ['error'], members: {
        _callback: null, _dataCallback: null, _request: null, _min: null, _defer: null, _last: null, start: function () { this.trigger(); }, trigger: function () {
            clearTimeout(this._defer); var
                data = this._dataCallback(); var
                    waiting = (this._request); var
                        recent = (this._min && (new
                            Date().getTime() < this._min)); if (!waiting && !recent && this.shouldSendRequest(this._last, data)) {
                                this._last = data; this._request = new
                                    JX.Request(this._uri, JX.bind(this, function (r) {
                                        this._callback(r); this._min = new
                                            Date().getTime() + this.getRateLimit(); clearTimeout(this._defer); this._defer = setTimeout(JX.bind(this, this.trigger), this.getRateLimit());
                                    })); this._request.listen('error', JX.bind(this, function (error) { this.invoke('error', error, this); })); this._request.listen('finally', JX.bind(this, function () { this._request = null; })); this._request.setData(data); this._request.setTimeout(this.getRequestTimeout()); var
                                        routable = this._request.getRoutable(); routable.setType('draft').setPriority(750); JX.Router.getInstance().queue(routable);
                            } else { this._defer = setTimeout(JX.bind(this, this.trigger), this.getFrequency()); }
        }, shouldSendRequest: function (last, data) {
            if (last === null) { return true; } for (var
                k
                in
                last) { if (data[k] !== last[k]) { return true; } } return false;
        }
    }, properties: { rateLimit: 500, frequency: 1000, requestTimeout: 20000 }
}); JX.behavior('differential-populate', function (config, statics) {
}); JX.behavior('differential-diff-radios', function (config) {
    JX.Stratcom.listen('click', 'differential-new-radio', function (e) {
        var
        target = e.getTarget(); var
            adjust; var
                node; var
                    reset = false; for (var
                        ii = 0; ii < config.radios.length; ii++) { node = JX.$(config.radios[ii]); if (parseInt(node.value, 10) >= parseInt(target.value, 10)) { if (node.checked) { node.checked = false; reset = true; } node.disabled = 'disabled'; } else { node.disabled = ''; if (!adjust || adjust.value < node.value) { adjust = node; } } } if (reset && adjust) { adjust.checked = 'checked'; }
    });
}); JX.behavior('aphront-drag-and-drop-textarea', function (config) {
    var
    target = JX.$(config.target); if (JX.PhabricatorDragAndDropFileUpload.isSupported()) {
        var
        drop = new
            JX.PhabricatorDragAndDropFileUpload(target).setURI(config.uri).setChunkThreshold(config.chunkThreshold); drop.listen('didBeginDrag', function () { JX.DOM.alterClass(target, config.activatedClass, true); }); drop.listen('didEndDrag', function () { JX.DOM.alterClass(target, config.activatedClass, false); }); drop.listen('didUpload', function (file) { JX.TextAreaUtils.insertFileReference(target, file); }); drop.start();
    }
}); JX.behavior('phabricator-object-selector', function (config) {
    var
    n = 0; var
        phids = {}; var
            display = []; var
                handles = config.handles; for (var
                    k
        in
        handles) { phids[k] = true; } var
            query_timer = null; var
                query_delay = 50; var
                    inputs = JX.DOM.scry(JX.$(config.form), 'input', 'aphront-dialog-application-input'); var
                        phid_input; for (var
                            ii = 0; ii < inputs.length; ii++) { if (inputs[ii].name == 'phids') { phid_input = inputs[ii]; break; } } var
                                last_value = JX.$(config.query).value; function
        onreceive(seq, r) {
            if (seq != n) { return; } display = []; for (var
                k
                in
                r) { handles[r[k].phid] = r[k]; display.push({ phid: r[k].phid }); } redrawList(true);
    } function
        redrawAttached() {
            var
            attached = []; for (var
                k
            in
            phids) { attached.push(renderHandle(handles[k], false).item); } if (!attached.length) { attached = renderNote('Nothing attached.'); } JX.DOM.setContent(JX.$(config.current), attached); phid_input.value = JX.keys(phids).join(';');
    } function
        redrawList(rebuild) {
            var
            ii; var
                content; if (rebuild) {
                    if (display.length) {
                        var
                        handle; content = []; for (ii = 0; ii < display.length; ii++) { handle = handles[display[ii].phid]; display[ii].node = renderHandle(handle, true); content.push(display[ii].node.item); }
                    } else { content = renderNote('No results.'); } JX.DOM.setContent(JX.$(config.results), content);
                } var
                    phid; var
                        is_disabled; var
                            button; var
                                at_maximum = !canSelectMore(); for (ii = 0; ii < display.length; ii++) { phid = display[ii].phid; is_disabled = false; if (phids.hasOwnProperty(phid)) { is_disabled = true; } if (at_maximum) { is_disabled = true; } button = display[ii].node.button; JX.DOM.alterClass(button, 'disabled', is_disabled); button.disabled = is_disabled; }
    } function
        renderHandle(h, attach) {
            var
            some_icon = JX.$N('span', { className: 'phui-icon-view phui-font-fa ' + 'fa-external-link phabricator-object-selector-popicon' }, ''); var
                view_object_link = JX.$N('a', { href: h.uri, target: '_blank' }, some_icon); var
                    select_object_link = JX.$N('a', { href: h.uri, sigil: 'object-attacher' }, h.name); var
                        select_object_button = JX.$N('a', { href: '#', sigil: 'object-attacher', className: 'button small button-grey' }, attach ? 'Select' : 'Remove'); var
                            cells = [JX.$N('td', {}, view_object_link), JX.$N('th', {}, select_object_link), JX.$N('td', {}, select_object_button)]; var
                                table = JX.$N('table', { className: 'phabricator-object-selector-handle' }); table.appendChild(JX.$N('tr', { sigil: 'object-attach-row', className: 'phabricator-object-selector-row', meta: { handle: h, table: table } }, cells)); return { item: table, button: select_object_button };
    } function
        renderNote(note) { return JX.$N('div', { className: 'object-selector-nothing' }, note); } function
        sendQuery() {
            query_timer = null; JX.DOM.setContent(JX.$(config.results), renderNote('Loading...')); new
                JX.Request(config.uri, JX.bind(null, onreceive, ++n)).setData({ filter: JX.$(config.filter).value, exclude: config.exclude, query: JX.$(config.query).value }).send();
    } function
        canSelectMore() { if (!config.maximum) { return true; } if (JX.keys(phids).length < config.maximum) { return true; } return false; } JX.DOM.listen(JX.$(config.results), 'click', 'object-attacher', function (e) {
            e.kill(); var
                data = e.getNodeData('object-attach-row'); var
                    phid = data.handle.phid; if (phids[phid]) { return; } if (!canSelectMore()) { return; } phids[phid] = true; redrawList(false); redrawAttached();
        }); JX.DOM.listen(JX.$(config.current), 'click', 'object-attacher', function (e) {
            e.kill(); var
                data = e.getNodeData('object-attach-row'); var
                    phid = data.handle.phid; delete
                        phids[phid]; redrawList(false); redrawAttached();
        }); JX.DOM.listen(JX.$(config.filter), 'change', null, function (e) { e.kill(); sendQuery(); }); JX.DOM.listen(JX.$(config.query), ['change', 'keydown', 'keyup', 'keypress'], null, function () {
            var
            cur_value = JX.$(config.query).value; if (last_value == cur_value) { return; } last_value = cur_value; clearTimeout(query_timer); query_timer = setTimeout(sendQuery, query_delay);
        }); sendQuery(); redrawList(true); redrawAttached();
}); JX.behavior('repository-crossreference', function (config, statics) {
    var
    highlighted; var
        linked = []; function
        isMacOS() { return (navigator.platform.indexOf('Mac') > -1); } function
        isHighlightModifierKey(e) {
            var
            signal_key; if (isMacOS()) { signal_key = 91; } else { signal_key = 17; } return (e.getRawEvent().keyCode === signal_key);
    } function
        hasHighlightModifierKey(e) { if (isMacOS()) { return e.getRawEvent().metaKey; } else { return e.getRawEvent().ctrlKey; } } var
            classHighlight = 'crossreference-item'; var
                classMouseCursor = 'crossreference-cursor'; var
                    class_map = { nc: 'class', nf: 'function', na: null, nb: 'builtin', n: null }; function
        link(element, lang) {
            JX.DOM.alterClass(element, 'repository-crossreference', true); linked.push(element); JX.DOM.listen(element, ['mouseover', 'mouseout', 'click'], 'tag:span', function (e) {
                if (e.getType() === 'mouseout') { unhighlight(); return; } if (!hasHighlightModifierKey(e)) { return; } var
                    target = e.getTarget(); try { if (JX.DOM.findAbove(target, 'div', 'differential-inline-comment')) { return; } } catch (ex) { } if (JX.DOM.isNode(target, 'span') && (target.className === 'bright')) { target = target.parentNode; } if (e.getType() === 'mouseover') {
                        while (target && target !== document.body) {
                            if (JX.DOM.isNode(target, 'span') && (target.className
                                in
                                class_map)) { highlighted = target; JX.DOM.alterClass(highlighted, classHighlight, true); break; } target = target.parentNode;
                        }
                    } else
                    if (e.getType() === 'click') { openSearch(target, { lang: lang }); }
            });
    } function
        unhighlight() { highlighted && JX.DOM.alterClass(highlighted, classHighlight, false); highlighted = null; } function
        openSearch(target, context) {
            var
            symbol = target.textContent || target.innerText; context = context || {}; context.lang = context.lang || null; context.repositories = context.repositories || (config && config.repositories) || []; var
                query = JX.copy({}, context); if (query.repositories.length) { query.repositories = query.repositories.join(','); } else {
                    delete
                    query.repositories;
                } query.jump = true; var
                    c = target.className; c = c.replace(classHighlight, '').trim(); if (class_map[c]) { query.type = class_map[c]; } if (target.hasAttribute('data-symbol-context')) { query.context = target.getAttribute('data-symbol-context'); } if (target.hasAttribute('data-symbol-name')) { symbol = target.getAttribute('data-symbol-name'); } var
                        line = getLineNumber(target); if (line !== null) { query.line = line; } if (!query.hasOwnProperty('path')) {
                            var
                            path = getPath(target); if (path !== null) { query.path = path; }
                        } var
                            char = getChar(target); if (char !== null) { query.char = char; } var
                                uri = JX.$U('/diffusion/symbol/' + symbol + '/'); uri.addQueryParams(query); window.open(uri.toString());
    } function
        linkAll() {
            var
            blocks = JX.DOM.scry(document.body, 'div', 'remarkup-code-block'); for (var
                i = 0; i < blocks.length; ++i) {
                    if (blocks[i].hasAttribute('data-code-lang')) {
                        var
                        lang = blocks[i].getAttribute('data-code-lang'); link(blocks[i], lang);
                    }
        }
    } function
        getLineNumber(target) {
            var
            cell = JX.DOM.findAbove(target, 'td'); if (!cell) { return null; } var
                row = JX.DOM.findAbove(target, 'tr'); if (!row) { return null; } var
                    ii; var
                        cell_list = []; for (ii = 0; ii < row.childNodes.length; ii++) { cell_list.push(row.childNodes[ii]); } cell_list.reverse(); var
                            found = false; for (ii = 0; ii < cell_list.length; ii++) {
                                if (cell_list[ii] === cell) { found = true; } if (found && JX.DOM.isType(cell_list[ii], 'th')) {
                                    var
                                    int_value = parseInt(cell_list[ii].textContent, 10); if (int_value) { return int_value; }
                                }
                            } return null;
    } function
        getPath(target) {
            var
            changeset; try { changeset = JX.DOM.findAbove(target, 'div', 'differential-changeset'); return JX.Stratcom.getData(changeset).path; } catch (ex) { } return null;
    } function
        getChar(target) {
            var
            cell = JX.DOM.findAbove(target, 'td'); if (!cell) { return null; } var
                char = 1; for (var
                    ii = 0; ii < cell.childNodes.length; ii++) {
                        var
                        node = cell.childNodes[ii]; if (node === target) { return char; } var
                            content = '' + node.textContent; char += content.length;
        } return null;
    } JX.Stratcom.listen('differential-preview-update', null, function (e) { linkAll(e.getData().container); }); JX.Stratcom.listen(['keydown', 'keyup'], null, function (e) { if (!isHighlightModifierKey(e)) { return; } setCursorMode(e.getType() === 'keydown'); if (!statics.active) { unhighlight(); } }); JX.Stratcom.listen('blur', null, function (e) { if (e.getTarget()) { return; } unhighlight(); setCursorMode(false); }); function
        setCursorMode(active) { statics.active = active; linked.forEach(function (element) { JX.DOM.alterClass(element, classMouseCursor, statics.active); }); } if (config && config.container) { link(JX.$(config.container), config.lang); } JX.Stratcom.listen(['mouseover', 'mouseout', 'click'], ['has-symbols', 'tag:span'], function (e) {
            var
            type = e.getType(); if (type === 'mouseout') { unhighlight(); return; } if (!hasHighlightModifierKey(e)) { return; } var
                target = e.getTarget(); try { if (JX.DOM.findAbove(target, 'div', 'differential-inline-comment')) { return; } } catch (ex) { } if (JX.DOM.isNode(target, 'span') && (target.className === 'bright')) { target = target.parentNode; } if (type === 'click') { openSearch(target, e.getNodeData('has-symbols').symbols); e.kill(); return; } if (e.getType() === 'mouseover') { while (target && target !== document.body) { if (!JX.DOM.isNode(target, 'span')) { target = target.parentNode; continue; } if (!class_map.hasOwnProperty(target.className)) { target = target.parentNode; continue; } highlighted = target; JX.DOM.alterClass(highlighted, classHighlight, true); break; } }
        });
}); JX.behavior('aphront-more', function () {}); JX.install('DiffInline', {}); JX.install('DiffChangeset', {}); JX.install('DiffChangesetList', {});