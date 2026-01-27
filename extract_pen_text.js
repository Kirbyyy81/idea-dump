const fs = require('fs');

function extractText(node) {
    let texts = [];
    if (typeof node === 'object' && node !== null) {
        if (node.type === 'text' && node.content) {
            texts.push(node.content);
        }

        for (const key in node) {
            if (Object.prototype.hasOwnProperty.call(node, key)) {
                texts = texts.concat(extractText(node[key]));
            }
        }
    } else if (Array.isArray(node)) {
        for (const item of node) {
            texts = texts.concat(extractText(item));
        }
    }
    return texts;
}

try {
    const data = fs.readFileSync('pencil-welcome.pen', 'utf8');
    const json = JSON.parse(data);
    const texts = extractText(json);
    console.log(texts.join('\n'));
} catch (e) {
    console.error(e);
}
