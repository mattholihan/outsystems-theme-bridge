// OutSystems Theme Bridge — CSS Formatters
// Pure functions for generating OutSystems-compatible CSS custom properties.

// ── Naming ──────────────────────────────────────────────────────────
// "brand/primary" → "--os-brand-primary"
function toOsVarName(figmaName: string): string {
    return (
        '--os-' +
        figmaName
            .replace(/\//g, '-')
            .replace(/\s+/g, '-')
            .replace(/[^a-zA-Z0-9-]/g, '')
            .toLowerCase()
    );
}

// ── Color helpers ───────────────────────────────────────────────────
function clamp(n: number): number {
    return Math.max(0, Math.min(255, Math.round(n * 255)));
}

function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (v: number) => clamp(v).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function formatColor(color: { r: number; g: number; b: number; a: number }): string {
    if (color.a === undefined || color.a >= 1) {
        return rgbToHex(color.r, color.g, color.b);
    }
    return `rgba(${clamp(color.r)}, ${clamp(color.g)}, ${clamp(color.b)}, ${parseFloat(color.a.toFixed(2))})`;
}

// ── CSS Generation ──────────────────────────────────────────────────

interface VarEntry {
    name: string;
    resolvedType: string;
    valuesByMode: Record<string, any>;
}

interface TextStyleEntry {
    name: string;
    fontFamily: string;
    fontStyle: string;
    fontSize: number;
    lineHeight: string | number;
}

interface GenerateOptions {
    wrapper: ':root' | '.theme-custom';
    prependComment: boolean;
    collectionName: string;
    modeName: string;
}

function fontStyleToWeight(style: string): number {
    const s = style.toLowerCase();
    if (s.includes('thin') || s.includes('hairline')) return 100;
    if (s.includes('extralight') || s.includes('ultra light')) return 200;
    if (s.includes('light')) return 300;
    if (s.includes('medium')) return 500;
    if (s.includes('semibold') || s.includes('semi bold') || s.includes('demi bold')) return 600;
    if (s.includes('extrabold') || s.includes('ultra bold') || s.includes('extra bold')) return 800;
    if (s.includes('bold')) return 700;
    if (s.includes('black') || s.includes('heavy')) return 900;
    return 400; // Regular / Normal
}

function generateVariableCSS(
    variables: VarEntry[],
    modeId: string,
    options: GenerateOptions
): string {
    const lines: string[] = [];

    if (options.prependComment) {
        lines.push(
            `/* Generated from Figma Design System — ${options.collectionName} (${options.modeName}) */`
        );
    }

    lines.push(`${options.wrapper} {`);

    // Group: Colors first, then numbers
    const colors = variables.filter((v) => v.resolvedType === 'COLOR');
    const numbers = variables.filter((v) => v.resolvedType === 'FLOAT');

    if (colors.length > 0) {
        lines.push('  /* ── Colors ─────────────────────────────── */');
        for (const v of colors) {
            const value = v.valuesByMode[modeId];
            if (value && typeof value === 'object' && 'r' in value) {
                lines.push(`  ${toOsVarName(v.name)}: ${formatColor(value)};`);
            }
        }
    }

    if (numbers.length > 0) {
        if (colors.length > 0) lines.push('');
        lines.push('  /* ── Numbers ────────────────────────────── */');
        for (const v of numbers) {
            const value = v.valuesByMode[modeId];
            if (value !== undefined && value !== null) {
                lines.push(`  ${toOsVarName(v.name)}: ${value};`);
            }
        }
    }

    lines.push('}');
    return lines.join('\n');
}

function generateTypographyCSS(
    textStyles: TextStyleEntry[],
    options: GenerateOptions
): string {
    if (textStyles.length === 0) return '';

    const lines: string[] = [];

    if (options.prependComment) {
        lines.push(
            `/* Generated from Figma Design System — Typography */`
        );
    }

    lines.push(`${options.wrapper} {`);
    lines.push('  /* ── Typography ──────────────────────────── */');

    for (let i = 0; i < textStyles.length; i++) {
        const s = textStyles[i];
        const base = toOsVarName(`font/${s.name}`);
        const weight = fontStyleToWeight(s.fontStyle);

        const lhValue =
            typeof s.lineHeight === 'number'
                ? `${s.lineHeight}px`
                : s.lineHeight === 'normal' || s.lineHeight === 'AUTO'
                    ? 'normal'
                    : s.lineHeight;

        lines.push(`  ${base}-family: '${s.fontFamily}';`);
        lines.push(`  ${base}-weight: ${weight};`);
        lines.push(`  ${base}-size: ${s.fontSize}px;`);
        lines.push(`  ${base}-line-height: ${lhValue};`);
        if (i < textStyles.length - 1) lines.push('');
    }

    lines.push('}');
    return lines.join('\n');
}
