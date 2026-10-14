const crypto = require('crypto');
module.exports = { newId: () => crypto.randomUUID(), newKey: (bytes = 24) => crypto.randomBytes(bytes).toString('hex') };
