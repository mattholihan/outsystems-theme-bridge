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
