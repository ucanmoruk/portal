const fs = require('fs');
const PizZip = require('pizzip');
const { createReport } = require('docx-templates');
const path = require('path');

async function test() {
    const templatePath = path.join(__dirname, 'sablon', 'talimat_sablon.docx');
    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);

    // Replace {1} with +++HTML sec1+++ etc in document.xml
    let docXml = zip.file("word/document.xml").asText();
    
    // The user might have typed {1} or {1.0}
    // We can just do a regex replace for any {something} if we want, but let's be specific
    // Wait, MS Word often splits {} into multiple XML nodes like <w:t>{</w:t><w:t>1</w:t><w:t>}</w:t>
    // This is the biggest problem with docx templates!
    // docxtemplater handles this splitting automatically. pizzip does not.
    // If I just string replace on document.xml, it will fail if Word split the tags.
}

test();
