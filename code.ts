// code.ts
const collections = figma.variables.getLocalVariableCollections();
const variables = figma.variables.getLocalVariables();

const data = variables.map(v => ({
    name: v.name,
    valuesByMode: v.valuesByMode,
    resolvedType: v.resolvedType
}));

figma.ui.postMessage({ type: 'load-variables', data });