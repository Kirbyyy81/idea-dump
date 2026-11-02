const engine = require('minimatch-engine');

class Minimatch extends engine.Minimatch {
    constructor(pattern, options) {
        super(pattern, options);
        // glob 7 reads segment metadata and calls String.match on each matcher.
        for (const parts of this.set) {
            for (const part of parts) {
                if (typeof part !== 'object') continue;
                part._glob = part.pattern;
                part[Symbol.match] = (value) => part.test(value) ? [value] : null;
            }
        }
    }
}

// ESLint 8 plugins call the CommonJS export; newer consumers use named exports.
module.exports = Object.assign(engine.minimatch, engine, { Minimatch });
