const router = require('express').Router();

router.use(require('./workRecords'));
router.use(require('./points'));
router.use(require('./shopSites'));
router.use(require('./roles'));

module.exports = router;
