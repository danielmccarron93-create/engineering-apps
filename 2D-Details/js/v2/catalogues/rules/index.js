/**
 * StructDraw v2 · Catalogue Layer · rules · registry finaliser
 * LAYER: catalogue/rules — loaded LAST of the rules/ files. Validates every
 *        rule that self-registered and stamps the registry ready.
 * READS:  window.v2.rules
 * WRITES: window.v2.rules.ready
 *
 * Classic <script>, no build step. Each rule file self-registers via
 * v2.rules.register(); this file is the load-time fail-fast check that every
 * registered rule exposes the (id, standard, clause, label, appliesTo, check)
 * shape from 04-catalogue-system.md §5.
 */
'use strict';
(function () {
  const v2 = window.v2;
  if (!v2 || !v2.rules || typeof v2.rules.all !== 'function') {
    throw new Error('rules/index.js: v2.rules registry missing — load _catalogue-namespace.js first');
  }

  v2.rules.all().forEach(function (rule) {
    ['id', 'standard', 'clause', 'label'].forEach(function (f) {
      if (typeof rule[f] !== 'string' || rule[f].length === 0) {
        throw new Error('rules/index.js: rule "' + rule.id + '" is missing string field "' + f + '"');
      }
    });
    if (typeof rule.appliesTo !== 'function') {
      throw new Error('rules/index.js: rule "' + rule.id + '" has no appliesTo() function');
    }
    if (typeof rule.check !== 'function') {
      throw new Error('rules/index.js: rule "' + rule.id + '" has no check() function');
    }
  });

  v2.rules.ready = true;
})();
