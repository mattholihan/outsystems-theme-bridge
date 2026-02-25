"use strict";
// OutSystems Theme Bridge — Figma Plugin Backend
// Gathers variable collections, resolves variables, and extracts text styles.
figma.showUI(__html__, { width: 480, height: 640, themeColors: true });
async function resolveVariableValue(value, visited = new Set()) {
    // Handle VariableAlias — resolve the chain
    if (value &&
        typeof value === 'object' &&
        value.type === 'VARIABLE_ALIAS' &&
        value.id) {
        if (visited.has(value.id))
            return null; // prevent circular refs
        visited.add(value.id);
        const aliased = await figma.variables.getVariableByIdAsync(value.id);
        if (!aliased)
            return null;
        // Grab the first mode's value from the aliased variable
        const firstModeId = Object.keys(aliased.valuesByMode)[0];
        if (!firstModeId)
            return null;
        return resolveVariableValue(aliased.valuesByMode[firstModeId], visited);
    }
    return value;
}
async function gatherData() {
    // --- Variable Collections ---
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const collectionPayloads = [];
    for (const collection of collections) {
        const modes = collection.modes.map((m) => ({
            modeId: m.modeId,
            name: m.name,
        }));
        const variables = [];
        for (const varId of collection.variableIds) {
            const variable = await figma.variables.getVariableByIdAsync(varId);
            if (!variable)
                continue;
            // Only include COLOR and FLOAT types
            if (variable.resolvedType !== 'COLOR' &&
                variable.resolvedType !== 'FLOAT')
                continue;
            // Resolve aliases for every mode value
            const resolvedValues = {};
            for (const [modeId, rawValue] of Object.entries(variable.valuesByMode)) {
                resolvedValues[modeId] = await resolveVariableValue(rawValue);
            }
            variables.push({
                name: variable.name,
                resolvedType: variable.resolvedType,
                valuesByMode: resolvedValues,
            });
        }
        collectionPayloads.push({
            id: collection.id,
            name: collection.name,
            modes,
            variables,
        });
    }
    // --- Text Styles ---
    const textStyles = await figma.getLocalTextStylesAsync();
    const textStylePayloads = textStyles.map((style) => {
        let lh = 'AUTO';
        if (style.lineHeight && typeof style.lineHeight === 'object') {
            const lhObj = style.lineHeight;
            if (lhObj.unit === 'PIXELS' && lhObj.value !== undefined) {
                lh = lhObj.value;
            }
            else if (lhObj.unit === 'PERCENT' && lhObj.value !== undefined) {
                lh = `${lhObj.value}%`;
            }
            else {
                lh = 'normal';
            }
        }
        return {
            name: style.name,
            fontFamily: style.fontName.family,
            fontStyle: style.fontName.style,
            fontSize: style.fontSize,
            lineHeight: lh,
        };
    });
    // --- Send to UI ---
    figma.ui.postMessage({
        type: 'plugin-data',
        collections: collectionPayloads,
        textStyles: textStylePayloads,
    });
}
gatherData();
// ── Message Handler ──────────────────────────────────────────────
figma.ui.onmessage = async (msg) => {
    if (msg.type === 'load-settings') {
        let baseUrl = await figma.clientStorage.getAsync('os-base-url') || '';
        let apiPath = await figma.clientStorage.getAsync('os-api-path') || '';
        const apiKey = await figma.clientStorage.getAsync('os-api-key') || '';
        // One-time migration from legacy single-endpoint key
        if (!baseUrl && !apiPath) {
            const legacy = await figma.clientStorage.getAsync('os-api-endpoint');
            if (legacy && typeof legacy === 'string') {
                try {
                    const url = new URL(legacy);
                    baseUrl = url.origin;
                    apiPath = url.pathname + url.search;
                    await figma.clientStorage.setAsync('os-base-url', baseUrl);
                    await figma.clientStorage.setAsync('os-api-path', apiPath);
                    await figma.clientStorage.deleteAsync('os-api-endpoint');
                }
                catch (_a) {
                    // Legacy value wasn't a valid URL — leave fields empty
                }
            }
        }
        figma.ui.postMessage({
            type: 'settings-loaded',
            baseUrl,
            apiPath,
            apiKey,
        });
    }
    if (msg.type === 'save-settings') {
        await figma.clientStorage.setAsync('os-base-url', msg.baseUrl || '');
        await figma.clientStorage.setAsync('os-api-path', msg.apiPath || '');
        await figma.clientStorage.setAsync('os-api-key', msg.apiKey || '');
        figma.notify('✓ Settings saved');
        figma.ui.postMessage({ type: 'settings-saved' });
    }
    if (msg.type === 'test-connection') {
        const fullUrl = msg.fullUrl;
        const apiKey = await figma.clientStorage.getAsync('os-api-key') || '';
        try {
            const res = await fetch(fullUrl, {
                method: 'POST',
                headers: Object.assign({ 'Content-Type': 'application/json' }, (apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})),
                body: JSON.stringify({}),
            });
            figma.ui.postMessage({
                type: 'test-result',
                success: res.ok,
                statusCode: res.status,
            });
        }
        catch (err) {
            figma.ui.postMessage({
                type: 'test-result',
                success: false,
                error: err.message || 'Network error',
            });
        }
    }
    if (msg.type === 'sync-to-outsystems') {
        const baseUrl = await figma.clientStorage.getAsync('os-base-url') || '';
        const apiPath = await figma.clientStorage.getAsync('os-api-path') || '';
        const apiKey = await figma.clientStorage.getAsync('os-api-key') || '';
        const endpoint = baseUrl + apiPath;
        if (!endpoint) {
            figma.notify('✗ No API endpoint configured. Go to Settings.', { error: true });
            figma.ui.postMessage({ type: 'sync-result', success: false, error: 'No endpoint' });
            return;
        }
        // Map to ODC's expected schema — raw array, no wrapper object
        const rawTokens = msg.payload.Tokens || msg.payload.tokens || [];
        const mappedPayload = rawTokens.map((t) => ({
            Name: t.Name || t.name,
            Value: t.Value || t.value,
            Type: 'Variable',
        }));
        console.log("PAYLOAD LEAVING FIGMA:", JSON.stringify(mappedPayload, null, 2));
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: Object.assign({ 'Content-Type': 'application/json' }, (apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})),
                body: JSON.stringify(mappedPayload),
            });
            if (res.ok) {
                figma.notify('✓ Synced successfully');
                figma.ui.postMessage({ type: 'sync-result', success: true });
            }
            else {
                const errorText = await res.text();
                console.error("OUTSYSTEMS COMPLAINT:", errorText);
                figma.notify(`✗ Sync failed: ${res.status} ${res.statusText}`, { error: true });
                figma.ui.postMessage({ type: 'sync-result', success: false, error: `${res.status}: ${errorText}` });
            }
        }
        catch (err) {
            figma.notify(`✗ Sync failed: ${err.message || 'Network error'}`, { error: true });
            figma.ui.postMessage({ type: 'sync-result', success: false, error: err.message || 'Network error' });
        }
    }
};
