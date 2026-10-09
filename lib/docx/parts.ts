/**
 * The fixed parts of a minimal WordprocessingML package (ECMA-376): content
 * types, relationships, styles with real Title / Heading 1 / Heading 2 /
 * List Bullet styles, one bullet numbering definition, and the document
 * properties. Fonts are the ones every Word, LibreOffice and ATS install
 * has (Calibri with Arial fallback).
 */

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const OFFICE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

/** Characters XML 1.0 cannot hold (C0 controls except tab / LF / CR, lone surrogates, U+FFFE/F). */
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

export function xmlEscape(s: string): string {
  return s
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export const CONTENT_TYPES = `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`

export const PACKAGE_RELS = `${XML_HEAD}<Relationships xmlns="${REL_NS}">
<Relationship Id="rId1" Type="${OFFICE_REL}/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="${OFFICE_REL}/extended-properties" Target="docProps/app.xml"/>
</Relationships>`

export const DOCUMENT_RELS = `${XML_HEAD}<Relationships xmlns="${REL_NS}">
<Relationship Id="rId1" Type="${OFFICE_REL}/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="${OFFICE_REL}/numbering" Target="numbering.xml"/>
</Relationships>`

function style(id: string, name: string, pPr: string, rPr: string, extra = ''): string {
  return `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>${extra}<w:qFormat/><w:pPr>${pPr}</w:pPr><w:rPr>${rPr}</w:rPr></w:style>`
}

export const STYLES = `${XML_HEAD}<w:styles xmlns:w="${W_NS}">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Arial"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${style('Title', 'Title', '<w:spacing w:after="40"/>', '<w:b/><w:sz w:val="36"/><w:szCs w:val="36"/>')}
${style('Subtitle', 'Subtitle', '<w:spacing w:after="40"/>', '<w:sz w:val="24"/><w:szCs w:val="24"/>')}
${style('Heading1', 'heading 1', '<w:keepNext/><w:spacing w:before="200" w:after="60"/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="000000"/></w:pBdr><w:outlineLvl w:val="0"/>', '<w:b/><w:caps/><w:sz w:val="24"/><w:szCs w:val="24"/>')}
${style('Heading2', 'heading 2', '<w:keepNext/><w:spacing w:before="120" w:after="0"/><w:outlineLvl w:val="1"/>', '<w:b/><w:sz w:val="22"/><w:szCs w:val="22"/>')}
${style('ListBullet', 'List Bullet', '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:after="20"/><w:ind w:left="360" w:hanging="360"/>', '')}
</w:styles>`

export const NUMBERING = `${XML_HEAD}<w:numbering xmlns:w="${W_NS}">
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`

export const APP_PROPS = `${XML_HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>lee</Application></Properties>`

export function coreProps(title: string, author: string): string {
  return `${XML_HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlEscape(title)}</dc:title><dc:creator>${xmlEscape(author)}</dc:creator></cp:coreProperties>`
}

export { W_NS, XML_HEAD }
